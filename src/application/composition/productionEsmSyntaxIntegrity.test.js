import fs from "node:fs";
import path from "node:path";
import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";

// Regression coverage for the 2026-09-24 production deploy failure: a candidate parsed cleanly
// under `node --check` (which loads this repository's extensionless `.js` files as CommonJS, so it
// never evaluates real ECMAScript-module early errors such as a duplicate lexical/import
// declaration) but failed the actual Next.js webpack production build with
// `Identifier 'readBuildIdentity' has already been declared` in
// productionApplicationComposition.js. That defect shipped past review because nothing exercised
// every production source file under the same module semantics (`sourceType: "module"`) the real
// build uses. This test closes that gap without paying for a full `next build`: esbuild's
// single-file transform enforces the same ECMAScript early-error rules (duplicate declarations,
// duplicate exports, and other module-level syntax errors) as the webpack build, in milliseconds
// per file and with no database, network, or bundler resolution required.
describe("production source ESM syntax integrity", () => {
  it("parses every production .js/.jsx source file as a syntactically valid ES module", () => {
    // .jsx is included, not just .js: files like src/screens/HomeScreen.jsx are imported directly
    // into the same production Next.js webpack build (e.g. src/app/page.js imports HomeScreen), so
    // a duplicate-declaration or other module-syntax defect there would ship exactly like the
    // .js-file defect this test exists to catch.
    const files = listFiles("src").filter((file) =>
      (file.endsWith(".js") || file.endsWith(".jsx"))
      && !file.endsWith(".test.js")
      && !file.endsWith(".test.jsx")
      && !file.endsWith(".stories.js")
      && !file.endsWith(".stories.jsx")
      && !file.includes(`${path.sep}__mocks__${path.sep}`)
      && !file.includes(`${path.sep}fixtures${path.sep}`)
    );
    expect(files.length).toBeGreaterThan(500); // sanity: the walk actually found the production tree

    const violations = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      try {
        // "jsx" is a strict superset of "js": several production .js files (React components,
        // Next.js app-router pages) carry JSX despite the .js extension, and Next's own webpack
        // build already parses all of them as JSX regardless of extension.
        transformSync(source, { loader: "jsx", format: "esm", target: "node22", sourcefile: file });
      } catch (error) {
        const message = error?.errors?.[0]?.text ?? error?.message ?? String(error);
        violations.push(`${file}: ${message}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}
