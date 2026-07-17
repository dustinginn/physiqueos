import { defineConfig } from "@playwright/test";

const isolatedRuntimeStore = "private/founder/tmp/playwright/runtime-store.json";

export default defineConfig({
  testDir: "./tests",

  fullyParallel: false,

  workers: 1,

  reporter: "list",

  webServer: {
    command: "node scripts/playwrightServer.mjs",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PHYSIQUEOS_PLAYWRIGHT: "1",
      PHYSIQUEOS_RUNTIME_STORE_PATH: isolatedRuntimeStore,
    },
  },

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
      grepInvert: /@legacy-diagnostic/,
      use: {},
    },
    {
      name: "legacy-diagnostics",
      grep: /@legacy-diagnostic/,
      use: {},
    },
  ],
});
