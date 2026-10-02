import Image from "@tiptap/extension-image";
import { convertFileSrc } from "@tauri-apps/api/core";

export interface Attachment {
  src: string;
  width: number;
  height: number;
}
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const attachmentPattern = /^note-image:([a-f0-9]{64}\.png)$/;
export function imageUrl(src: string): string {
  const match = attachmentPattern.exec(src);
  return match ? convertFileSrc(match[1], "note-image") : src;
}
export function storedImageSource(src: string): string | null {
  if (/^https:\/\//i.test(src) || attachmentPattern.test(src)) return src;
  const match =
    /^(?:note-image:\/\/localhost\/|http:\/\/note-image\.localhost\/)([a-f0-9]{64}\.png)$/.exec(
      src,
    );
  return match ? `note-image:${match[1]}` : null;
}
export const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) =>
          storedImageSource(element.getAttribute("src") ?? ""),
        renderHTML: (attributes) => ({ src: imageUrl(attributes.src ?? "") }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (element) =>
          storedImageSource(element.getAttribute("src") ?? "") ? {} : false,
      },
    ];
  },
}).configure({
  allowBase64: false,
  resize: {
    enabled: true,
    directions: ["bottom-left", "bottom-right"],
    minWidth: 32,
    minHeight: 24,
    alwaysPreserveAspectRatio: true,
  },
});

export async function imageBytes(file: File): Promise<number[]> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type))
    throw new Error("仅支持 PNG、JPEG、WebP 图片");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("图片文件必须小于 20 MB");
  return Array.from(new Uint8Array(await file.arrayBuffer()));
}
