import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    const handlers = new Map();
    const callbacks = new Map();
    let id = 0;
    w.__TAURI_INTERNALS__ = {
      convertFileSrc: (path: string) =>
        `${location.origin}/test-attachments/${path}`,
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
      transformCallback: (fn: unknown) => {
        callbacks.set(++id, fn);
        return id;
      },
      unregisterCallback: (key: number) => callbacks.delete(key),
      invoke: async (cmd: string, args: any) => {
        if (cmd === "plugin:event|listen") {
          handlers.set(args.event, args.handler);
          return ++id;
        }
        if (cmd === "plugin:event|unlisten") return;
        if (cmd === "read_data")
          return {
            data: JSON.parse(
              localStorage.getItem("test-note") ||
                JSON.stringify({
                  content: { type: "doc", content: [{ type: "paragraph" }] },
                  settings: {
                    color: "#cccccc",
                    background: "#333333",
                    opacity: 1,
                    fontSize: 18,
                    lineHeight: 1.4,
                    padding: 20,
                    textAlign: "center",
                    alwaysOnTop: true,
                  },
                }),
            ),
            warning: null,
          };
        if (cmd === "save_content" || cmd === "save_settings") {
          if (w.failSave) throw Error("disk full");
          const current = await w.__TAURI_INTERNALS__.invoke("read_data");
          current.data[cmd === "save_content" ? "content" : "settings"] =
            args[cmd === "save_content" ? "content" : "settings"];
          localStorage.setItem("test-note", JSON.stringify(current.data));
          return;
        }
        if (cmd === "import_image" || cmd === "paste_image") {
          if (w.failImage) throw Error("disk full");
          if (w.imageDelay)
            await new Promise((resolve) => setTimeout(resolve, w.imageDelay));
          w.importCount = (w.importCount ?? 0) + 1;
          w.lastImageBytes = args?.bytes;
          return {
            src: `note-image:${"a".repeat(64)}.png`,
            width: 200,
            height: 100,
          };
        }
        if (cmd === "finish_exit") {
          w.finished = true;
          return;
        }
      },
    };
    w.emitTest = (event: string) =>
      callbacks.get(handlers.get(event))?.({ event, payload: null });
  });
});
test("Chinese text persists; formats, unsafe links, and small layout work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page).toHaveTitle("便签");
  const editor = page.getByRole("textbox", { name: "便签内容" });
  await expect(editor).toBeVisible();
  await editor.fill("今天的便签\n第二行内容");
  await expect(page.getByRole("status")).toHaveText("已保存");
  await page.reload();
  await expect(editor).toContainText("今天的便签");
  await page.getByRole("button", { name: "格式菜单" }).click();
  await page.getByRole("button", { name: "待办", exact: true }).click();
  await expect(page.locator("li[data-type=taskItem]")).toHaveCount(1);
  await page.getByRole("button", { name: "链接", exact: true }).click();
  await page.getByLabel("链接地址").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "插入", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("仅支持");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/nalomu-note-editor.png" });
});
test("failed save blocks exit and retry drains content", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "便签内容" });
  await expect(editor).toBeVisible();
  await page.evaluate(() => {
    (window as any).failSave = true;
  });
  await editor.fill("不可丢失");
  await page.evaluate(() => (window as any).emitTest("request-exit"));
  await expect(page.getByRole("alert")).toContainText("保存失败");
  expect(await page.evaluate(() => (window as any).finished)).toBeUndefined();
  await page.evaluate(() => {
    (window as any).failSave = false;
    (window as any).emitTest("request-exit");
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).finished))
    .toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("test-note")),
  ).toContain("不可丢失");
});
test("settings save and reload", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 620 });
  await page.goto("/?settings");
  await page.getByLabel("字号").fill("24");
  await page.getByLabel("始终置顶").uncheck();
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.locator("p[role=status]")).toHaveText("设置已保存");
  await page.reload();
  await expect(page.getByLabel("字号")).toHaveValue("24");
  await expect(page.getByLabel("始终置顶")).not.toBeChecked();
  await page.screenshot({ path: "/tmp/nalomu-note-settings.png" });
});
async function imageFixture(page: import("@playwright/test").Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#397cca";
    context.fillRect(0, 0, 200, 100);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const bytes = Buffer.from(encoded, "base64");
  await page.route("**/test-attachments/**", (route) =>
    route.fulfill({ contentType: "image/png", body: bytes }),
  );
  return bytes;
}
test("pasted bitmap is displayed, resized proportionally, and restored from an attachment ID", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "便签内容" });
  await expect(editor).toBeVisible();
  const png = await imageFixture(page);
  await editor.click();
  await page.evaluate((bytes) => {
    const data = new DataTransfer();
    data.items.add(
      new File([new Uint8Array(bytes)], "clipboard.png", { type: "image/png" }),
    );
    document.querySelector("[role=textbox]")!.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, Array.from(png));
  const image = page.locator(".tiptap img");
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(200);
  await image.click();
  const handle = page.locator('[data-resize-handle="bottom-right"]');
  const bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 6, bounds!.y + 6);
  await page.mouse.down();
  await page.mouse.move(bounds!.x - 44, bounds!.y - 19, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("已保存");
  const content = await page.evaluate(
    () => JSON.parse(localStorage.getItem("test-note")!).content,
  );
  const attrs = content.content.find(
    (node: any) => node.type === "image",
  ).attrs;
  expect(attrs.src).toMatch(/^note-image:[a-f0-9]{64}\.png$/);
  expect(attrs.width).toBeLessThan(200);
  expect(attrs.width / attrs.height).toBeCloseTo(2, 1);
  await page.reload();
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(200);
  const actual = await image.boundingBox();
  expect(actual!.width).toBeCloseTo(attrs.width, 0);
  expect(actual!.height).toBeCloseTo(attrs.height, 0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/nalomu-note-pasted-image.png" });
});
test("file import and native clipboard fallback wait for image storage before exit", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "便签内容" });
  await expect(editor).toBeVisible();
  const png = await imageFixture(page);
  await page.getByLabel("选择本地图片").setInputFiles({
    name: "selected.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.locator(".tiptap img")).toBeVisible();
  await page.locator(".tiptap > p").last().click();
  await page.evaluate(() => {
    (window as any).imageDelay = 200;
  });
  await page.getByRole("button", { name: "格式菜单" }).click();
  await page.getByRole("button", { name: "粘贴图片", exact: true }).click();
  await page.evaluate(() => (window as any).emitTest("request-exit"));
  expect(await page.evaluate(() => (window as any).finished)).toBeUndefined();
  await expect
    .poll(() => page.evaluate(() => (window as any).finished))
    .toBe(true);
  const note = await page.evaluate(
    () => JSON.parse(localStorage.getItem("test-note")!).content,
  );
  expect(
    note.content.filter((node: any) => node.type === "image"),
  ).toHaveLength(2);
});
test("image storage failure preserves text and reports the import error", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "便签内容" });
  await expect(editor).toBeVisible();
  await editor.fill("已有内容");
  const png = await imageFixture(page);
  await page.evaluate(() => {
    (window as any).failImage = true;
  });
  await page
    .getByLabel("选择本地图片")
    .setInputFiles({ name: "fail.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("alert")).toContainText("图片插入失败");
  await expect(editor).toContainText("已有内容");
  await expect(page.locator(".tiptap img")).toHaveCount(0);
});
