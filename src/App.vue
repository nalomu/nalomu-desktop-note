<script setup lang="ts">
import {
  computed,
  onMounted,
  onBeforeUnmount,
  ref,
  shallowRef,
  nextTick,
} from "vue";
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
import NoteIcon from "./NoteIcon.vue";
import type { Settings } from "./settings";
import SettingsPanel from "./SettingsPanel.vue";
import FloatingPanel from "./FloatingPanel.vue";
import { DOMSerializer } from "@tiptap/pm/model";
const settingsPage = new URLSearchParams(location.search).has("settings");
const settings = ref<Settings>({
  color: "#e4e5e7",
  background: "#242629",
  opacity: 1,
  fontSize: 18,
  lineHeight: 1.65,
  padding: 24,
  textAlign: "left",
  alwaysOnTop: true,
});
const editor = shallowRef<Editor>();
const error = ref(""),
  status = ref("正在读取…"),
  ready = ref(false),
  selected = ref(false),
  menu = ref(false);
const formatRevision = ref(0);
const savingSettings = ref(false);
const pinning = ref(false);
const toolbarAnchor = ref({ x: 12, y: 52 });
const contextAnchor = ref<{ x: number; y: number }>();
const contextMenu = ref<HTMLElement>();
const mac = navigator.userAgent.includes("Mac");
const shortcut = mac ? "⌘" : "Ctrl+";
function placeToolbar() {
  const current = editor.value;
  if (!current || menu.value) return;
  const { from, to } = current.state.selection;
  const a = current.view.coordsAtPos(from),
    b = current.view.coordsAtPos(to);
  toolbarAnchor.value = {
    x: (a.left + b.left) / 2 - 60,
    y: a.top >= 100 ? a.top - 50 : b.bottom + 8,
  };
}
function showFullToolbar() {
  contextAnchor.value = undefined;
  menu.value = true;
  toolbarAnchor.value = { x: innerWidth - 310, y: 52 };
}
function toggleToolbar() {
  contextAnchor.value = undefined;
  menu.value = !menu.value;
  toolbarAnchor.value = menu.value
    ? { x: innerWidth - 310, y: 52 }
    : toolbarAnchor.value;
}
function dismissPanels(event: PointerEvent) {
  if ((event.target as HTMLElement).closest(".floating-panel, .format-toggle"))
    return;
  contextAnchor.value = undefined;
  menu.value = false;
}
function closePanels(event: KeyboardEvent) {
  if (event.key === "Escape") {
    contextAnchor.value = undefined;
    menu.value = false;
    selected.value = false;
    urlKind.value = undefined;
    editor.value?.commands.focus();
  }
}
async function togglePin() {
  if (pinning.value) return;
  pinning.value = true;
  try {
    const value = !settings.value.alwaysOnTop;
    await invoke("set_always_on_top", { value });
    settings.value.alwaysOnTop = value;
    error.value = "";
  } catch (e) {
    error.value = `置顶设置失败：${e}`;
  } finally {
    pinning.value = false;
  }
}
async function showContext(event: MouseEvent) {
  event.preventDefault();
  const current = editor.value;
  if (!current) return;
  if (current.state.selection.empty) {
    const position = current.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    if (position) current.commands.setTextSelection(position.pos);
  }
  menu.value = false;
  selected.value = false;
  contextAnchor.value = { x: event.clientX, y: event.clientY };
  await nextTick();
  contextMenu.value
    ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
    ?.focus();
}
function menuKeys(event: KeyboardEvent) {
  if (!["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(event.key))
    return;
  event.preventDefault();
  const buttons = Array.from(
    contextMenu.value?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    ) ?? [],
  );
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (index +
            (event.key === "ArrowUp" || event.shiftKey ? -1 : 1) +
            buttons.length) %
          buttons.length;
  buttons[next]?.focus();
}
function editAction(action: () => void) {
  contextAnchor.value = undefined;
  action();
}
async function clipboardAction(action: "copy" | "cut" | "paste") {
  const current = editor.value;
  if (!current) return;
  contextAnchor.value = undefined;
  const position = { bookmark: current.state.selection.getBookmark() };
  imageBookmarks.add(position);
  try {
    if (action === "paste") {
      const text = await invoke<string>("read_clipboard_text");
      current
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.setSelection(position.bookmark.resolve(tr.doc));
          return true;
        })
        .insertContent(
          text.split(/\r?\n/).map((line) => ({
            type: "paragraph",
            content: line ? [{ type: "text", text: line }] : [],
          })),
        )
        .run();
    } else {
      const selection = current.state.selection;
      if (selection.empty) return;
      if (
        "node" in selection &&
        (selection.node as { type: { name: string }; attrs: { src: string } })
          .type.name === "image"
      ) {
        await invoke("copy_image", {
          src: (selection.node as { attrs: { src: string } }).attrs.src,
        });
      } else {
        const fragment = DOMSerializer.fromSchema(
          current.schema,
        ).serializeFragment(selection.content().content);
        const container = document.createElement("div");
        container.append(fragment);
        await invoke("write_clipboard", {
          html: container.innerHTML,
          text: current.state.doc.textBetween(
            selection.from,
            selection.to,
            "\n",
          ),
        });
      }
      if (action === "cut")
        current
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.setSelection(position.bookmark.resolve(tr.doc));
            return true;
          })
          .deleteSelection()
          .run();
    }
    error.value = "";
  } catch (e) {
    error.value = `剪贴板操作失败：${e}`;
  } finally {
    imageBookmarks.delete(position);
    current.commands.focus(undefined, { scrollIntoView: false });
  }
}

function active(name: string, attrs?: Record<string, unknown>) {
  void formatRevision.value;
  return editor.value?.isActive(name, attrs) ?? false;
}
function canHistory(action: "undo" | "redo") {
  void formatRevision.value;
  return editor.value?.can()[action]() ?? false;
}
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
  if (savingSettings.value) return;
  savingSettings.value = true;
  try {
    await invoke("save_settings", {
      settings: JSON.parse(JSON.stringify(settings.value)),
    });
    status.value = "设置已保存";
    error.value = "";
  } catch (e) {
    error.value = `设置保存失败：${e}`;
  } finally {
    savingSettings.value = false;
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
  document.addEventListener("pointerdown", dismissPanels);
  document.addEventListener("keydown", closePanels);
  window.addEventListener("resize", placeToolbar);
  try {
    stops.push(
      await listen<Settings>("settings-updated", (e) => {
        if (settingsPage) settings.value.alwaysOnTop = e.payload.alwaysOnTop;
        else settings.value = e.payload;
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
          formatRevision.value++;
          imageBookmarks.forEach((position) => {
            position.bookmark = position.bookmark.map(transaction.mapping);
          });
        },
        onSelectionUpdate: ({ editor: e }) => {
          selected.value = !e.state.selection.empty;
          if (selected.value) placeToolbar();
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
  document.removeEventListener("pointerdown", dismissPanels);
  document.removeEventListener("keydown", closePanels);
  window.removeEventListener("resize", placeToolbar);
  clearTimeout(timer);
  stops.forEach((stop) => stop());
  editor.value?.destroy();
});
</script>
<template>
  <SettingsPanel
    v-if="settingsPage"
    v-model="settings"
    :ready="ready"
    :status="status"
    :error="error"
    :preview-style="noteStyle"
    :saving="savingSettings"
    @save="saveSettings"
  />
  <main v-else class="note" :style="{ background: noteStyle.background }">
    <header class="note-header">
      <span
        class="drag"
        data-tauri-drag-region
        @mousedown.left="getCurrentWindow().startDragging()"
      >
        <NoteIcon name="note" />便签
      </span>
      <button
        class="icon-button format-toggle"
        aria-label="格式菜单"
        title="格式菜单"
        :aria-expanded="menu"
        :class="{ active: menu }"
        aria-controls="format-toolbar"
        @click="toggleToolbar"
      >
        Aa
      </button>
      <button
        class="icon-button"
        aria-label="始终置顶"
        :title="settings.alwaysOnTop ? '取消置顶' : '置顶便签'"
        :aria-pressed="settings.alwaysOnTop"
        :disabled="!ready || pinning"
        @click="togglePin"
      >
        <NoteIcon name="pin" />
      </button>
      <button
        class="icon-button"
        aria-label="打开设置"
        title="打开设置"
        @click="openSettings"
      >
        <NoteIcon name="settings" />
      </button>
      <button
        class="icon-button"
        aria-label="隐藏便签"
        title="隐藏便签"
        @click="getCurrentWindow().hide()"
      >
        <NoteIcon name="minus" />
      </button>
    </header>
    <FloatingPanel
      v-if="editor && (menu || selected) && !contextAnchor && !urlKind"
      :x="toolbarAnchor.x"
      :y="toolbarAnchor.y"
      :width="menu ? 300 : 124"
      :draggable="menu"
      label="文字格式"
    >
      <template #header
        ><button
          class="panel-close"
          aria-label="关闭格式菜单"
          @click="
            menu = false;
            selected = false;
          "
        >
          <NoteIcon name="close" /></button
      ></template>
      <nav
        id="format-toolbar"
        class="format-toolbar"
        aria-label="文字格式"
        @mousedown.prevent
      >
        <div class="tool-row">
          <div v-if="menu" class="tool-group text-styles">
            <button
              :aria-pressed="active('paragraph')"
              @click="editor.chain().focus().setParagraph().run()"
            >
              正文
            </button>
            <button
              :aria-pressed="active('heading', { level: 2 })"
              @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
            >
              标题
            </button>
          </div>
          <div class="tool-group inline-tools">
            <button
              class="icon-button bold-tool"
              aria-label="粗体"
              title="粗体 · ⌘/Ctrl B"
              :aria-pressed="active('bold')"
              @click="editor.chain().focus().toggleBold().run()"
            >
              B
            </button>
            <button
              class="icon-button italic-tool"
              aria-label="斜体"
              title="斜体 · ⌘/Ctrl I"
              :aria-pressed="active('italic')"
              @click="editor.chain().focus().toggleItalic().run()"
            >
              I
            </button>
            <button
              class="icon-button"
              aria-label="链接"
              title="链接"
              :aria-pressed="active('link')"
              @click="urlKind = 'link'"
            >
              <NoteIcon name="link" />
            </button>
          </div>
        </div>
        <template v-if="menu">
          <div class="tool-row block-tools">
            <button
              :aria-pressed="active('bulletList')"
              @click="editor.chain().focus().toggleBulletList().run()"
            >
              <NoteIcon name="list" />列表
            </button>
            <button
              :aria-pressed="active('orderedList')"
              @click="editor.chain().focus().toggleOrderedList().run()"
            >
              <NoteIcon name="ordered" />编号
            </button>
            <button
              :aria-pressed="active('taskList')"
              @click="editor.chain().focus().toggleTaskList().run()"
            >
              <NoteIcon name="task" />待办
            </button>
            <button
              :aria-pressed="active('blockquote')"
              @click="editor.chain().focus().toggleBlockquote().run()"
            >
              <NoteIcon name="quote" />引用
            </button>
            <button
              :aria-pressed="active('codeBlock')"
              @click="editor.chain().focus().toggleCodeBlock().run()"
            >
              <NoteIcon name="code" />代码
            </button>
          </div>
          <div class="tool-row media-tools">
            <button @click="urlKind = 'image'">
              <NoteIcon name="link" />图片链接
            </button>
            <button @click="imagePicker?.click()">
              <NoteIcon name="image" />本地图片
            </button>
            <button
              @click="insertImage(() => invoke<Attachment>('paste_image'))"
            >
              <NoteIcon name="clipboard" />粘贴图片
            </button>
            <div class="tool-group history-tools">
              <button
                class="icon-button"
                aria-label="撤销"
                title="撤销"
                :disabled="!canHistory('undo')"
                @click="editor.chain().focus().undo().run()"
              >
                <NoteIcon name="undo" />
              </button>
              <button
                class="icon-button"
                aria-label="重做"
                title="重做"
                :disabled="!canHistory('redo')"
                @click="editor.chain().focus().redo().run()"
              >
                <NoteIcon name="redo" />
              </button>
            </div>
          </div>
        </template>
      </nav>
    </FloatingPanel>
    <input
      ref="imagePicker"
      class="image-picker"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      multiple
      aria-label="选择本地图片"
      @change="chooseImage"
    />
    <FloatingPanel
      v-if="urlKind"
      :x="toolbarAnchor.x"
      :y="toolbarAnchor.y"
      :width="300"
    >
      <form class="url-form" @submit.prevent="applyUrl">
        <label
          >{{ urlKind === "image" ? "图片地址" : "链接地址"
          }}<input
            v-model="url"
            type="text"
            placeholder="https://"
            autofocus
            required /></label
        ><button type="submit">插入</button
        ><button type="button" @click="urlKind = undefined">取消</button>
      </form>
    </FloatingPanel>
    <EditorContent
      v-if="editor"
      class="content"
      :editor="editor"
      :style="{ ...noteStyle, background: 'transparent' }"
      @focusout="save().catch(() => {})"
      @contextmenu="showContext"
      @scroll="placeToolbar"
    />
    <FloatingPanel
      v-if="contextAnchor && editor"
      :x="contextAnchor.x"
      :y="contextAnchor.y"
      :width="220"
    >
      <div
        ref="contextMenu"
        class="editor-context-menu"
        role="menu"
        aria-label="编辑菜单"
        @keydown="menuKeys"
        @mousedown.prevent
      >
        <button
          role="menuitem"
          :disabled="!canHistory('undo')"
          @click="editAction(() => editor?.chain().focus().undo().run())"
        >
          <NoteIcon name="undo" />撤销<kbd>{{ shortcut }}Z</kbd>
        </button>
        <button
          role="menuitem"
          :disabled="!canHistory('redo')"
          @click="editAction(() => editor?.chain().focus().redo().run())"
        >
          <NoteIcon name="redo" />重做<kbd>{{ shortcut }}⇧Z</kbd>
        </button>
        <hr />
        <button
          role="menuitem"
          :disabled="editor.state.selection.empty"
          @click="clipboardAction('cut')"
        >
          剪切<kbd>{{ shortcut }}X</kbd>
        </button>
        <button
          role="menuitem"
          :disabled="editor.state.selection.empty"
          @click="clipboardAction('copy')"
        >
          复制<kbd>{{ shortcut }}C</kbd>
        </button>
        <button role="menuitem" @click="clipboardAction('paste')">
          粘贴纯文本
        </button>
        <button
          role="menuitem"
          @click="
            editAction(() =>
              insertImage(() => invoke<Attachment>('paste_image')),
            )
          "
        >
          粘贴图片
        </button>
        <button
          role="menuitem"
          @click="editAction(() => editor?.chain().focus().selectAll().run())"
        >
          全选<kbd>{{ shortcut }}A</kbd>
        </button>
        <hr />
        <button role="menuitem" @click="showFullToolbar()">文字格式…</button>
        <button
          role="menuitem"
          :disabled="editor.state.selection.empty"
          @click="
            editAction(() => editor?.chain().focus().unsetAllMarks().run())
          "
        >
          清除文字格式
        </button>
        <button role="menuitem" @click="editAction(() => imagePicker?.click())">
          插入本地图片…
        </button>
      </div>
    </FloatingPanel>
    <footer class="note-footer">
      <span
        role="status"
        :class="{ pending: status !== '已保存' || importing }"
        >{{ importing ? "正在保存图片…" : status }}</span
      ><button v-if="status === '未保存'" @click="save().catch(() => {})">
        重试保存
      </button>
      <span v-if="status !== '未保存'" class="save-hint">自动保存</span>
    </footer>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </main>
</template>
