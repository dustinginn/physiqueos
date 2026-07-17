import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const livePath = path.resolve(root, "private", "founder", "runtime-store.json");
const configuredPath = process.env.PHYSIQUEOS_RUNTIME_STORE_PATH;

if (!configuredPath) throw new Error("PHYSIQUEOS_RUNTIME_STORE_PATH is required for Playwright.");

const isolatedPath = path.resolve(root, configuredPath);
if (isolatedPath === livePath) throw new Error("Refusing to prepare Playwright against the live Founder runtime store.");

fs.mkdirSync(path.dirname(isolatedPath), { recursive: true });
fs.copyFileSync(livePath, isolatedPath);
console.log(`Prepared isolated Playwright runtime store: ${path.relative(root, isolatedPath)}`);
