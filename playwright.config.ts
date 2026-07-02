import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",

  fullyParallel: false,

  workers: 1,

  reporter: "list",

  use: {
    baseURL: "http://127.0.0.1:3000",

    headless: true,

    screenshot: "only-on-failure",

    trace: "off",

    video: "off",

    viewport: {
      width: 393,
      height: 852,
    },
  },

  projects: [
    {
      name: "chromium",
      use: {},
    },
  ],
});