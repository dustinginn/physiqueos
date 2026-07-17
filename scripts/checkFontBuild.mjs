import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const buildRoot = path.resolve(".next");
const staticRoot = path.join(buildRoot, "static");
const files = await walk(buildRoot);
const cssFiles = files.filter((file) => file.endsWith(".css"));
const fontFiles = files.filter((file) => file.endsWith(".woff2"));
const manifestFiles = files.filter((file) => /next-font-manifest\.json$/.test(file));

assert(cssFiles.length > 0, "No generated CSS files were found. Run `npm run build` first.");

const css = (await Promise.all(cssFiles.map((file) => readFile(file, "utf8")))).join("\n");
const plusJakartaCss = css
  .split(/(?=@font-face)/g)
  .filter((block) => /Plus Jakarta|plusJakarta|plus_jakarta/i.test(block))
  .join("\n");

assert(plusJakartaCss.length > 0, "Generated CSS does not contain the Plus Jakarta Sans font.");
assert(/@font-face[\s\S]*?src:\s*url\(/i.test(plusJakartaCss), "Plus Jakarta Sans CSS has no real url(...) font source.");
assert(fontFiles.length > 0, "No WOFF2 font asset was emitted into .next.");
assert(fontFiles.some((file) => file.startsWith(staticRoot)), "No WOFF2 font asset was emitted under .next/static.");
assert(!/fonts\.(?:googleapis|gstatic)\.com/i.test(css), "Generated CSS still references Google Fonts.");
assert(!/src:\s*local\(Arial\)[\s\S]*?(?:Plus Jakarta Sans Fallback|plus_jakarta_sans)/i.test(plusJakartaCss), "The build contains only the Arial-backed Plus Jakarta fallback.");

const manifests = await Promise.all(manifestFiles.map(async (file) => ({ file, value: JSON.parse(await readFile(file, "utf8")) })));
assert(manifests.length > 0, "No Next.js font manifest was emitted.");
assert(manifests.some(({ value }) => hasManifestFont(value)), "Next.js font manifests do not reference an emitted font asset.");

console.log(JSON.stringify({
  cssFiles: cssFiles.length,
  fontFiles: fontFiles.map((file) => path.relative(buildRoot, file)),
  manifestFiles: manifestFiles.length,
  remoteGoogleFontReferences: 0,
}, null, 2));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return nested.flat();
}

function hasManifestFont(value) {
  if (typeof value === "string") return /\.woff2(?:$|\?)/.test(value);
  if (Array.isArray(value)) return value.some(hasManifestFont);
  if (value && typeof value === "object") return Object.values(value).some(hasManifestFont);
  return false;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Font build validation failed: ${message}`);
}
