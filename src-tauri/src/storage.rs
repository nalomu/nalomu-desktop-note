use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, io::Write, path::PathBuf};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub color: String,
    pub background: String,
    pub opacity: f64,
    pub font_size: u32,
    pub line_height: f64,
    pub padding: u32,
    pub text_align: String,
    pub always_on_top: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            color: "#cccccc".into(),
            background: "#333333".into(),
            opacity: 1.0,
            font_size: 18,
            line_height: 1.4,
            padding: 20,
            text_align: "center".into(),
            always_on_top: true,
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        let color = |s: &str| {
            s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
        };
        if !color(&self.color)
            || !color(&self.background)
            || !(0.05..=1.0).contains(&self.opacity)
            || !(10..=72).contains(&self.font_size)
            || !(1.0..=3.0).contains(&self.line_height)
            || self.padding > 80
            || !["left", "center", "right", "justify"].contains(&self.text_align.as_str())
        {
            return Err("外观设置超出有效范围".into());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Data {
    pub schema_version: u32,
    pub content: Value,
    pub settings: Settings,
}
impl Default for Data {
    fn default() -> Self {
        Self {
            schema_version: 2,
            content: json!({"type":"doc","content":[{"type":"paragraph"}]}),
            settings: Settings::default(),
        }
    }
}
pub fn validate_doc(v: &Value) -> Result<(), String> {
    fn walk(v: &Value, depth: usize) -> Result<(), String> {
        if depth > 64 {
            return Err("文档层级过深".into());
        }
        let t = v
            .get("type")
            .and_then(Value::as_str)
            .ok_or("缺少文档节点类型")?;
        if ![
            "doc",
            "paragraph",
            "text",
            "heading",
            "bulletList",
            "orderedList",
            "listItem",
            "taskList",
            "taskItem",
            "blockquote",
            "codeBlock",
            "hardBreak",
            "horizontalRule",
            "image",
        ]
        .contains(&t)
        {
            return Err(format!("不支持的节点: {t}"));
        }
        if t == "text" && !v.get("text").is_some_and(Value::is_string) {
            return Err("无效文本".into());
        }
        if t == "image"
            && !v
                .pointer("/attrs/src")
                .and_then(Value::as_str)
                .is_some_and(|s| s.starts_with("https://") || crate::images::valid_src(s))
        {
            return Err("图片仅允许 HTTPS 地址或便签附件".into());
        }
        if let Some(marks) = v.get("marks") {
            for mark in marks.as_array().ok_or("无效格式")? {
                let kind = mark.get("type").and_then(Value::as_str).ok_or("无效格式")?;
                if !["bold", "italic", "strike", "code", "underline", "link"].contains(&kind) {
                    return Err("不支持的格式".into());
                }
                if kind == "link"
                    && !mark
                        .pointer("/attrs/href")
                        .and_then(Value::as_str)
                        .is_some_and(|s| {
                            s.starts_with("https://")
                                || s.starts_with("http://")
                                || s.starts_with("mailto:")
                        })
                {
                    return Err("不安全的链接".into());
                }
            }
        }
        if let Some(attrs) = v.get("attrs") {
            let attrs = attrs.as_object().ok_or("无效节点属性")?;
            let allowed: &[&str] = match t {
                "heading" => &["level"],
                "orderedList" => &["start", "type"],
                "taskItem" => &["checked"],
                "codeBlock" => &["language"],
                "image" => &["src", "alt", "title", "width", "height"],
                _ => &[],
            };
            if attrs.keys().any(|key| !allowed.contains(&key.as_str())) {
                return Err("不支持的节点属性".into());
            }
            if t == "image" {
                for field in ["width", "height"] {
                    if let Some(value) = attrs.get(field).filter(|v| !v.is_null()) {
                        if !value
                            .as_f64()
                            .is_some_and(|n| n.is_finite() && (1.0..=8192.0).contains(&n))
                        {
                            return Err("无效图片显示尺寸".into());
                        }
                    }
                }
            }
            if t == "heading"
                && !attrs
                    .get("level")
                    .and_then(Value::as_u64)
                    .is_some_and(|n| (1..=6).contains(&n))
            {
                return Err("无效标题级别".into());
            }
            if t == "taskItem" && !attrs.get("checked").is_some_and(Value::is_boolean) {
                return Err("无效待办状态".into());
            }
        }
        let children = v.get("content").and_then(Value::as_array);
        if ["text", "image", "hardBreak", "horizontalRule"].contains(&t)
            && children.is_some_and(|c| !c.is_empty())
        {
            return Err("叶节点不能包含子节点".into());
        }
        if let Some(children) = children {
            for child in children {
                let kind = child.get("type").and_then(Value::as_str).unwrap_or("");
                let valid = match t {
                    "doc" | "blockquote" | "listItem" | "taskItem" => [
                        "paragraph",
                        "heading",
                        "bulletList",
                        "orderedList",
                        "taskList",
                        "blockquote",
                        "codeBlock",
                        "horizontalRule",
                        "image",
                    ]
                    .contains(&kind),
                    "paragraph" | "heading" => ["text", "hardBreak"].contains(&kind),
                    "codeBlock" => kind == "text",
                    "bulletList" | "orderedList" => kind == "listItem",
                    "taskList" => kind == "taskItem",
                    _ => false,
                };
                if !valid {
                    return Err("文档节点嵌套无效".into());
                }
            }
        }
        if let Some(children) = v.get("content") {
            for c in children.as_array().ok_or("无效子节点")? {
                walk(c, depth + 1)?;
            }
        }
        Ok(())
    }
    if v.get("type").and_then(Value::as_str) != Some("doc") || v.to_string().len() > 5_000_000 {
        return Err("无效或过大的文档".into());
    }
    walk(v, 0)
}
pub struct Storage {
    pub data: Data,
    pub dir: PathBuf,
    pub warning: Option<String>,
}
impl Storage {
    pub fn load(dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join("note.json");
        let read = |p: &std::path::Path| -> Result<Data, String> {
            let mut data: Data = serde_json::from_slice(&fs::read(p).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            if ![1, 2].contains(&data.schema_version) {
                return Err("不支持的数据版本".into());
            }
            data.settings.validate()?;
            validate_doc(&data.content)?;
            data.schema_version = 2;
            Ok(data)
        };
        if !path.exists() {
            return Ok(Self {
                data: Data::default(),
                dir,
                warning: None,
            });
        }
        match read(&path) {
            Ok(data) => Ok(Self {
                data,
                dir,
                warning: None,
            }),
            Err(e) => {
                // A newer application may own this file. Never downgrade it from a backup.
                if e == "不支持的数据版本" {
                    return Err(e);
                }
                let stamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos();
                fs::copy(&path, dir.join(format!("note-corrupt-{stamp}.json")))
                    .map_err(|e| e.to_string())?;
                let data = read(&dir.join("note.backup.json"))
                    .map_err(|_| format!("数据损坏，原文件已保留，请备份后修复 note.json：{e}"))?;
                Ok(Self {
                    data,
                    dir,
                    warning: Some("主文件损坏，已保留原文件并恢复最近有效备份".into()),
                })
            }
        }
    }
    pub fn save(&mut self, next: Data) -> Result<(), String> {
        next.settings.validate()?;
        validate_doc(&next.content)?;
        let atomic = |name: &str, bytes: &[u8]| -> Result<(), String> {
            let mut temp = tempfile::NamedTempFile::new_in(&self.dir).map_err(|e| e.to_string())?;
            temp.write_all(bytes).map_err(|e| e.to_string())?;
            temp.as_file().sync_all().map_err(|e| e.to_string())?;
            temp.persist(self.dir.join(name))
                .map_err(|e| e.to_string())?;
            Ok(())
        };
        atomic(
            "note.backup.json",
            &serde_json::to_vec(&self.data).map_err(|e| e.to_string())?,
        )?;
        atomic(
            "note.json",
            &serde_json::to_vec_pretty(&next).map_err(|e| e.to_string())?,
        )?;
        self.data = next;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_and_recovery() {
        let d = tempfile::tempdir().unwrap();
        let mut s = Storage::load(d.path().into()).unwrap();
        let mut n = s.data.clone();
        n.settings.padding = 30;
        s.save(n.clone()).unwrap();
        s.save(n).unwrap();
        assert_eq!(
            Storage::load(d.path().into())
                .unwrap()
                .data
                .settings
                .padding,
            30
        );
        fs::write(d.path().join("note.json"), "broken").unwrap();
        assert!(Storage::load(d.path().into()).unwrap().warning.is_some());
    }
    #[test]
    fn reject_unsafe() {
        assert!(validate_doc(&json!({"type":"doc","content":[{"type":"image","attrs":{"src":"javascript:alert(1)"}}]})).is_err());
        let mut s = Settings::default();
        s.opacity = 2.0;
        assert!(s.validate().is_err());
    }
    #[test]
    fn failed_write_keeps_memory() {
        let d = tempfile::tempdir().unwrap();
        let mut s = Storage::load(d.path().into()).unwrap();
        s.dir = d.path().join("missing");
        let mut n = s.data.clone();
        n.settings.padding = 40;
        assert!(s.save(n).is_err());
        assert_eq!(s.data.settings.padding, 20);
    }
}
#[cfg(test)]
mod regression_tests {
    use super::*;
    #[test]
    fn settings_and_content_do_not_overwrite_each_other() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Storage::load(dir.path().into()).unwrap();
        let mut edit = store.data.clone();
        edit.content = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"中文便签"}]}]});
        store.save(edit).unwrap();
        let mut settings = store.data.clone();
        settings.settings.font_size = 24;
        store.save(settings).unwrap();
        let restored = Storage::load(dir.path().into()).unwrap();
        assert_eq!(restored.data.settings.font_size, 24);
        assert!(restored.data.content.to_string().contains("中文便签"));
    }
    #[test]
    fn corrupt_without_backup_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.json");
        fs::write(&path, "broken").unwrap();
        assert!(Storage::load(dir.path().into()).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "broken");
    }
    #[test]
    fn future_version_is_not_downgraded() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Storage::load(dir.path().into()).unwrap();
        store.save(Data::default()).unwrap();
        let mut data = store.data.clone();
        data.schema_version = 3;
        fs::write(
            dir.path().join("note.json"),
            serde_json::to_vec(&data).unwrap(),
        )
        .unwrap();
        assert!(Storage::load(dir.path().into()).is_err());
    }
    #[test]
    fn rejects_raw_nested_docs_and_script_links() {
        for child in [
            json!({"type":"raw"}),
            json!({"type":"doc"}),
            json!({"type":"paragraph","content":[{"type":"text","text":"bad","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]}),
        ] {
            assert!(validate_doc(&json!({"type":"doc","content":[child]})).is_err());
        }
    }
}
#[cfg(test)]
mod image_document_tests {
    use super::*;
    #[test]
    fn preserves_owned_image_dimensions_and_rejects_unsafe_sources() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Storage::load(dir.path().into()).unwrap();
        let image = crate::images::import_rgba(dir.path(), 1, 1, &[0, 0, 0, 255]).unwrap();
        let mut next = store.data.clone();
        next.content = json!({"type":"doc","content":[{"type":"image","attrs":{"src":image.src,"width":120.5,"height":120.5}}]});
        store.save(next).unwrap();
        let restored = Storage::load(dir.path().into()).unwrap();
        assert_eq!(
            restored.data.content.pointer("/content/0/attrs/width"),
            Some(&json!(120.5))
        );
        for src in [
            "file:///etc/passwd",
            "note-image:../../note.json",
            "data:image/png;base64,bad",
        ] {
            assert!(validate_doc(
                &json!({"type":"doc","content":[{"type":"image","attrs":{"src":src}}]})
            )
            .is_err());
        }
        assert!(validate_doc(
            &json!({"type":"doc","content":[{"type":"image","attrs":{"src":image.src,"width":-1}}]})
        )
        .is_err());
    }
}
#[cfg(test)]
mod legacy_schema_tests {
    use super::*;
    #[test]
    fn reads_version_one_and_saves_version_two() {
        let dir = tempfile::tempdir().unwrap();
        let mut legacy = Data::default();
        legacy.schema_version = 1;
        fs::write(
            dir.path().join("note.json"),
            serde_json::to_vec(&legacy).unwrap(),
        )
        .unwrap();
        let mut loaded = Storage::load(dir.path().into()).unwrap();
        assert_eq!(loaded.data.schema_version, 2);
        loaded.save(loaded.data.clone()).unwrap();
        let saved: Data =
            serde_json::from_slice(&fs::read(dir.path().join("note.json")).unwrap()).unwrap();
        assert_eq!(saved.schema_version, 2);
    }
}
