import "./preparePlaywrightRuntimeStore.mjs";

process.argv = [process.execPath, "next", "dev"];
await import("../node_modules/next/dist/bin/next");
