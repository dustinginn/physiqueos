import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const entry = path.resolve(
  process.cwd(),
  "src/screens/ActivityProtocolBuilderScreen.jsx"
);

describe("Activity provider client boundary", () => {
  it("keeps Node-only modules out of the client-reachable Activity graph", () => {
    const graph = collectRelativeModuleGraph(entry);
    const nodeImports = graph.flatMap(({ file, source }) =>
      [...source.matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*["'](node:[^"']+)/g)]
        .map((match) => ({ file: path.relative(process.cwd(), file), specifier: match[1] }))
    );

    expect(nodeImports).toEqual([]);
  });
});

function collectRelativeModuleGraph(entryFile) {
  const pending = [entryFile];
  const visited = new Set();
  const graph = [];

  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(file, "utf8");
    graph.push({ file, source });

    for (const match of source.matchAll(
      /(?:from\s+|import\s*\()\s*["'](\.[^"']+)["']/g
    )) {
      const resolved = resolveRelativeModule(file, match[1]);
      if (resolved) pending.push(resolved);
    }
  }

  return graph;
}

function resolveRelativeModule(importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);
  return [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js")]
    .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}
