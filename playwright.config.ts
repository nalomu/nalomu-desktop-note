import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  outputDir: "/tmp/nalomu-note-playwright",
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 320, height: 240 },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
});
