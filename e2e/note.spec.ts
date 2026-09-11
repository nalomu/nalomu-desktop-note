import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    const handlers = new Map();
    const callbacks = new Map();
    let id = 0;
    w.__TAURI_INTERNALS__ = {
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
