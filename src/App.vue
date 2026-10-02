<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, shallowRef } from "vue";
import { Editor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { NoteImage, imageBytes, type Attachment } from "./images";
import type { SelectionBookmark } from "@tiptap/pm/state";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SaveQueue } from "./persistence";
interface Settings {
  color: string;
  background: string;
  opacity: number;
  fontSize: number;
  lineHeight: number;
  padding: number;
  textAlign: "left" | "center" | "right" | "justify";
  alwaysOnTop: boolean;
}
const settingsPage = new URLSearchParams(location.search).has("settings");
const settings = ref<Settings>({
  color: "#cccccc",
  background: "#333333",
  opacity: 1,
  fontSize: 18,
  lineHeight: 1.4,
  padding: 20,
  textAlign: "center",
  alwaysOnTop: true,
});
const editor = shallowRef<Editor>();
const error = ref(""),
  status = ref("正在读取…"),
  ready = ref(false),
  selected = ref(false),
  menu = ref(false);
const urlKind = ref<"link" | "image">(),
  url = ref("");
const imagePicker = ref<HTMLInputElement>();
const importing = ref(0);
const imageBookmarks = new Set<{ bookmark: SelectionBookmark }>();
const imageJobs = new Set<Promise<void>>();
const stops: UnlistenFn[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
const queue = new SaveQueue<unknown>((content) =>
  invoke("save_content", { content }),
);
const noteStyle = computed(() => {
  const s = settings.value;
  return {
    color: s.color,
    background: `rgba(${parseInt(s.background.slice(1, 3), 16)},${parseInt(s.background.slice(3, 5), 16)},${parseInt(s.background.slice(5, 7), 16)},${s.opacity})`,
    fontSize: `${s.fontSize}px`,
    lineHeight: s.lineHeight,
    padding: `${s.padding}px`,
    textAlign: s.textAlign,
  };
});
async function save() {
  clearTimeout(timer);
  try {
    await queue.flush();
    status.value = "已保存";
    if (error.value.startsWith("保存失败")) error.value = "";
  } catch (e) {
    error.value = `保存失败，内容仍在窗口中：${e}`;
    status.value = "未保存";
    throw e;
  }
}
function changed() {
  if (!editor.value) return;
  queue.set(editor.value.getJSON());
  status.value = "未保存";
  clearTimeout(timer);
  timer = setTimeout(() => {
    void save().catch(() => {});
  }, 300);
}
async function exit() {
  try {
    await Promise.all(imageJobs);
    await save();
    await invoke("finish_exit");
  } catch {
    /* keep window alive for retry */
  }
}
async function saveSettings() {
  try {
    await invoke("save_settings", {
      settings: JSON.parse(JSON.stringify(settings.value)),
    });
    status.value = "设置已保存";
    error.value = "";
  } catch (e) {
    error.value = String(e);
  }
}
function applyUrl() {
  const value = url.value.trim();
  if (urlKind.value === "image") {
    if (!/^https:\/\//i.test(value)) {
      error.value = "图片必须使用 HTTPS 地址";
      return;
    }
    editor.value?.chain().focus().setImage({ src: value }).run();
  } else {
    if (!/^(https?:\/\/|mailto:)/i.test(value)) {
      error.value = "链接仅支持 HTTP、HTTPS 或邮箱";
      return;
    }
    editor.value
      ?.chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: value })
      .run();
  }
  urlKind.value = undefined;
  url.value = "";
  error.value = "";
}
let imageTail = Promise.resolve();
function insertImages(load: () => Promise<(Attachment & { alt?: string })[]>) {
  const current = editor.value;
  if (!current) return;
  const position = { bookmark: current.state.selection.getBookmark() };
  imageBookmarks.add(position);
  importing.value++;
  const job = imageTail.then(async () => {
    try {
      const attachments = await load();
      if (current.isDestroyed) return;
      const maxWidth = Math.max(32, current.view.dom.clientWidth);
      const inserted = current
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.setSelection(position.bookmark.resolve(tr.doc));
          return true;
        })
        .insertContent(
          attachments.map((attachment) => {
            const width = Math.min(attachment.width, maxWidth);
            return {
              type: "image",
              attrs: {
                ...attachment,
                width,
                height: Math.max(
                  1,
                  Math.round((attachment.height * width) / attachment.width),
                ),
              },
            };
          }),
        )
        .run();
      if (!inserted)
        throw new Error("当前位置无法插入图片，请将光标移到正文后重试");
      error.value = "";
    } catch (e) {
      error.value = `图片插入失败：${e}`;
      throw e;
    } finally {
      imageBookmarks.delete(position);
      importing.value--;
    }
  });
  imageTail = job.catch(() => {});
  imageJobs.add(job);
  // exit() waits for these jobs before saving the final document.
  void job.catch(() => {}).finally(() => imageJobs.delete(job));
}
function insertImage(load: () => Promise<Attachment>) {
  insertImages(async () => [await load()]);
}
function importFiles(files: File[]) {
  if (!files.length) return;
  insertImages(async () => {
    const attachments: (Attachment & { alt: string })[] = [];
    for (const file of files) {
      const bytes = await imageBytes(file);
      attachments.push({
        ...(await invoke<Attachment>("import_image", { bytes })),
        alt: file.name,
      });
    }
    return attachments;
  });
}
function chooseImage(event: Event) {
  const input = event.target as HTMLInputElement;
  importFiles(Array.from(input.files ?? []));
  input.value = "";
}
function pasteImages(event: ClipboardEvent): boolean {
  const data = event.clipboardData;
  if (!data) return false;
  const files = Array.from(data.files);
  if (files.length) {
    event.preventDefault();
    importFiles(files);
    return true;
  }
  const html = data.getData("text/html");
  if (html) {
    const pasted = new DOMParser().parseFromString(html, "text/html");
    const image = pasted.querySelector("img");
    if (
      image &&
      !pasted.body.textContent?.trim() &&
      !image.getAttribute("src")?.includes("note-image")
    ) {
      event.preventDefault();
      insertImage(() => invoke<Attachment>("paste_image"));
      return true;
    }
  }
  // WebKit sometimes exposes native bitmap data only through the system clipboard.
  if (!data.getData("text/plain") && !data.getData("text/html")) {
    event.preventDefault();
    insertImage(() => invoke<Attachment>("paste_image"));
    return true;
  }
  return false;
}
async function openSettings() {
  try {
    await invoke("open_settings");
  } catch (e) {
    error.value = String(e);
  }
}
onMounted(async () => {
  try {
    stops.push(
      await listen<Settings>("settings-updated", (e) => {
        settings.value = e.payload;
      }),
    );
    if (!settingsPage)
      stops.push(
        await listen("request-exit", () => {
          void exit();
        }),
      );
    const result = await invoke<{
      data: { content: object; settings: Settings };
      warning: string | null;
    }>("read_data");
    settings.value = result.data.settings;
    error.value = result.warning ?? "";
    if (!settingsPage) {
      editor.value = new Editor({
        content: result.data.content,
        extensions: [
          StarterKit.configure({
            link: {
              openOnClick: false,
              protocols: ["http", "https", "mailto"],
            },
          }),
          NoteImage,
          TaskList,
          TaskItem.configure({
            nested: true,
            HTMLAttributes: { "data-type": "taskItem" },
          }),
        ],
        editorProps: {
          handlePaste: (_view, event) => pasteImages(event),
          attributes: {
            "aria-label": "便签内容",
            role: "textbox",
            "aria-multiline": "true",
            spellcheck: "false",
          },
        },
        onUpdate: changed,
        onTransaction: ({ transaction }) => {
          imageBookmarks.forEach((position) => {
            position.bookmark = position.bookmark.map(transaction.mapping);
          });
        },
        onSelectionUpdate: ({ editor: e }) => {
          selected.value = !e.state.selection.empty;
        },
      });
    }
    ready.value = true;
    status.value = "已保存";
  } catch (e) {
    error.value = `无法读取便签：${e}`;
    status.value = "读取失败";
  }
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  stops.forEach((stop) => stop());
  editor.value?.destroy();
});
</script>
<template>
  <main v-if="settingsPage" class="settings">
    <h1>便签设置</h1>
    <p class="muted">调整便签的外观与窗口行为</p>
    <form v-if="ready" @submit.prevent="saveSettings">
      <label>文字颜色<input v-model="settings.color" type="color" /></label>
      <label
        >背景颜色<input v-model="settings.background" type="color"
      /></label>
      <label
        >背景透明度<input
          v-model.number="settings.opacity"
          type="range"
          min="0.05"
          max="1"
          step="0.05"
        /><output>{{ Math.round(settings.opacity * 100) }}%</output></label
      >
      <label
        >字号<input
          v-model.number="settings.fontSize"
          type="number"
          min="10"
          max="72"
          required
      /></label>
      <label
        >行高<input
          v-model.number="settings.lineHeight"
          type="number"
          min="1"
          max="3"
          step="0.1"
          required
      /></label>
      <label
        >内边距<input
          v-model.number="settings.padding"
          type="number"
          min="0"
          max="80"
          required
      /></label>
      <label
        >对齐<select v-model="settings.textAlign">
          <option value="left">左对齐</option>
          <option value="center">居中</option>
          <option value="right">右对齐</option>
          <option value="justify">两端对齐</option>
        </select></label
      >
      <label
        >始终置顶<input v-model="settings.alwaysOnTop" type="checkbox"
      /></label>
      <button class="primary" type="submit">保存设置</button>
    </form>
    <p role="status">{{ status }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </main>
  <main v-else class="note" :style="{ background: noteStyle.background }">
    <header>
      <span
        class="drag"
        data-tauri-drag-region
        @mousedown.left="getCurrentWindow().startDragging()"
        >便签</span
      ><button aria-label="格式菜单" @click="menu = !menu">Aa</button
      ><button aria-label="打开设置" @click="openSettings">⚙</button
      ><button aria-label="隐藏便签" @click="getCurrentWindow().hide()">
        −
      </button>
    </header>
    <nav v-if="editor && (menu || selected)" aria-label="文字格式">
      <button @click="editor.chain().focus().toggleBold().run()">粗体</button
      ><button @click="editor.chain().focus().toggleItalic().run()">斜体</button
      ><button @click="urlKind = 'link'">链接</button>
      <template v-if="menu"
        ><button @click="editor.chain().focus().setParagraph().run()">
          正文</button
        ><button
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
        >
          标题</button
        ><button @click="editor.chain().focus().toggleBulletList().run()">
          列表</button
        ><button @click="editor.chain().focus().toggleOrderedList().run()">
          编号</button
        ><button @click="editor.chain().focus().toggleTaskList().run()">
          待办</button
        ><button @click="editor.chain().focus().toggleBlockquote().run()">
          引用</button
        ><button @click="editor.chain().focus().toggleCodeBlock().run()">
          代码</button
        ><button @click="urlKind = 'image'">图片链接</button
        ><button @click="imagePicker?.click()">本地图片</button
        ><button @click="insertImage(() => invoke<Attachment>('paste_image'))">
          粘贴图片</button
        ><button @click="editor.chain().focus().undo().run()">撤销</button
        ><button @click="editor.chain().focus().redo().run()">
          重做
        </button></template
      >
    </nav>
    <input
      ref="imagePicker"
      class="image-picker"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      multiple
      aria-label="选择本地图片"
      @change="chooseImage"
    />
    <form v-if="urlKind" class="url-form" @submit.prevent="applyUrl">
      <label
        >{{ urlKind === "image" ? "图片地址" : "链接地址"
        }}<input v-model="url" autofocus required /></label
      ><button type="submit">插入</button
      ><button type="button" @click="urlKind = undefined">取消</button>
    </form>
    <EditorContent
      v-if="editor"
      class="content"
      :editor="editor"
      :style="{ ...noteStyle, background: 'transparent' }"
      @focusout="save().catch(() => {})"
    />
    <footer>
      <span role="status">{{ importing ? "正在保存图片…" : status }}</span
      ><button v-if="status === '未保存'" @click="save().catch(() => {})">
        重试保存
      </button>
    </footer>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </main>
</template>
