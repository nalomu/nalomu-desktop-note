//! Owned note attachments. The renderer can address only content-hashed PNGs.
use image::{DynamicImage, ImageFormat, ImageReader, Limits};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Write},
    path::Path,
};

pub const MAX_INPUT_BYTES: usize = 20 * 1024 * 1024;
const MAX_PIXELS: u64 = 16_000_000;
const MAX_STORED_BYTES: u64 = 64 * 1024 * 1024;
const PREFIX: &str = "note-image:";
#[derive(Serialize)]
pub struct Attachment {
    pub src: String,
    pub width: u32,
    pub height: u32,
}

pub fn filename(src: &str) -> Option<&str> {
    let name = src.strip_prefix(PREFIX)?;
    let hash = name.strip_suffix(".png")?;
    (hash.len() == 64
        && hash
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)))
    .then_some(name)
}
pub fn valid_src(src: &str) -> bool {
    filename(src).is_some()
}

fn dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0
        || height == 0
        || width > 8192
        || height > 8192
        || u64::from(width) * u64::from(height) > MAX_PIXELS
    {
        return Err("图片尺寸过大（最多 1600 万像素，单边 8192 像素）".into());
    }
    Ok(())
}
pub fn import(dir: &Path, bytes: &[u8]) -> Result<Attachment, String> {
    if bytes.is_empty() || bytes.len() > MAX_INPUT_BYTES {
        return Err("图片文件必须小于 20 MB".into());
    }
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    if !matches!(
        reader.format(),
        Some(ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP)
    ) {
        return Err("仅支持 PNG、JPEG、WebP 图片".into());
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(MAX_STORED_BYTES);
    reader.limits(limits);
    let decoded = reader.decode().map_err(|e| format!("无法读取图片：{e}"))?;
    store(dir, decoded)
}
pub fn import_rgba(dir: &Path, width: u32, height: u32, rgba: &[u8]) -> Result<Attachment, String> {
    dimensions(width, height)?;
    if rgba.len() as u64 != u64::from(width) * u64::from(height) * 4 {
        return Err("剪贴板图片数据不完整".into());
    }
    let buffer =
        image::RgbaImage::from_raw(width, height, rgba.to_vec()).ok_or("剪贴板图片数据无效")?;
    store(dir, DynamicImage::ImageRgba8(buffer))
}
fn store(dir: &Path, image: DynamicImage) -> Result<Attachment, String> {
    let (width, height) = (image.width(), image.height());
    dimensions(width, height)?;
    let mut encoded = Cursor::new(Vec::new());
    image
        .write_to(&mut encoded, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let bytes = encoded.into_inner();
    if bytes.len() as u64 > MAX_STORED_BYTES {
        return Err("转换后的图片过大".into());
    }
    let name = format!("{:x}.png", Sha256::digest(&bytes));
    let folder = dir.join("images");
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let path = folder.join(&name);
    if path.exists() {
        // Reject symlinks and unexpected bytes even for a deduplicated name.
        if !fs::symlink_metadata(&path)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_file()
            || fs::read(&path).map_err(|e| e.to_string())? != bytes
        {
            return Err("附件文件冲突，请检查应用数据目录".into());
        }
    } else {
        let mut temp = tempfile::NamedTempFile::new_in(&folder).map_err(|e| e.to_string())?;
        temp.write_all(&bytes).map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        temp.persist_noclobber(&path).map_err(|e| e.to_string())?;
    }
    Ok(Attachment {
        src: format!("{PREFIX}{name}"),
        width,
        height,
    })
}
pub fn read(dir: &Path, name: &str) -> Result<Vec<u8>, String> {
    if filename(&format!("{PREFIX}{name}")).is_none() {
        return Err("无效附件 ID".into());
    }
    let path = dir.join("images").join(name);
    let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if !meta.file_type().is_file() || meta.len() > MAX_STORED_BYTES {
        return Err("无效附件文件".into());
    }
    fs::read(path).map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn attachment_survives_source_removal_and_deduplicates() {
        let dir = tempfile::tempdir().unwrap();
        let img = DynamicImage::new_rgba8(20, 10);
        let mut input = Cursor::new(Vec::new());
        img.write_to(&mut input, ImageFormat::Png).unwrap();
        let source = dir.path().join("source.png");
        fs::write(&source, input.get_ref()).unwrap();
        let a = import(dir.path(), &fs::read(&source).unwrap()).unwrap();
        fs::remove_file(source).unwrap();
        let b = import(dir.path(), input.get_ref()).unwrap();
        assert_eq!(a.src, b.src);
        assert_eq!((a.width, a.height), (20, 10));
        let restored = read(dir.path(), filename(&a.src).unwrap()).unwrap();
        assert_eq!(image::load_from_memory(&restored).unwrap().width(), 20);
        assert_eq!(fs::read_dir(dir.path().join("images")).unwrap().count(), 1);
    }
    #[test]
    fn reject_paths_invalid_images_and_oversized_rgba() {
        let dir = tempfile::tempdir().unwrap();
        for name in [
            "../note.json",
            "/etc/passwd",
            "%2e%2e/note.json",
            "invalid.png",
        ] {
            assert!(read(dir.path(), name).is_err());
        }
        assert!(import(dir.path(), b"<svg onload='alert(1)'></svg>").is_err());
        assert!(import_rgba(dir.path(), 8193, 1, &[]).is_err());
        assert!(import_rgba(dir.path(), 1, 1, &[0]).is_err());
    }
    #[test]
    fn failed_storage_does_not_return_an_attachment() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("images"), "blocked").unwrap();
        assert!(import_rgba(dir.path(), 1, 1, &[0, 0, 0, 255]).is_err());
    }
}
