import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFounderRuntimeSemanticDigest } from "./FounderRuntimeSemanticDigest.js";

// The digest is now hashed in pieces instead of from one serialized string. It
// must produce the same value as before for every input, since stored baselines
// and optimistic-concurrency fences compare against it. This is the previous
// implementation, verbatim, as the reference.
function referenceDigest(value) {
  function stableSerialize(item) {
    if (Array.isArray(item)) return `[${item.map(stableSerialize).join(",")}]`;
    if (item && typeof item === "object") {
      return `{${Object.keys(item).sort().map((key) =>
        `${JSON.stringify(key)}:${stableSerialize(item[key])}`).join(",")}}`;
    }
    return JSON.stringify(item);
  }
  return createHash("sha256").update(stableSerialize(value)).digest("hex").toUpperCase();
}

function prng(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x1_0000_0000; };
}

function randomValue(random, depth = 0) {
  const roll = random();
  if (depth > 4 || roll < 0.35) {
    const primitives = [null, undefined, true, false, 0, -0, 1.5, NaN, Infinity, -12, "", "plain", "quote\"and\\slash",
      "emoji 🧬 ok", "lone \uD800 surrogate", "newline\nand\ttab", "é composed", () => 1, Symbol("s")];
    return primitives[Math.floor(random() * primitives.length)];
  }
  if (roll < 0.65) {
    const array = Array.from({ length: Math.floor(random() * 5) }, () => randomValue(random, depth + 1));
    if (random() < 0.2) array.length += 2; // trailing holes
    return array;
  }
  const object = {};
  for (let index = 0; index < Math.floor(random() * 6); index += 1) {
    object[`${random() < 0.5 ? "k" : "z"}${Math.floor(random() * 50)}`] = randomValue(random, depth + 1);
  }
  return object;
}

describe("streamed Founder runtime semantic digest", () => {
  it.each([
    ["empty object", {}],
    ["empty array", []],
    ["undefined object member", { a: undefined, b: 1 }],
    ["undefined and function array elements", [1, undefined, () => 2, Symbol("x"), 3]],
    ["sparse array", [1, , 3]],
    ["nested", { b: [{ y: 2, x: [null, { q: "w" }] }], a: { c: { d: [] } } }],
    ["dates and maps serialize as their own keys", { when: new Date("2026-10-09T00:00:00Z"), map: new Map([["a", 1]]) }],
    ["unicode", { name: "Ünïcödé 🧬", lone: "\uDFFF", "kéy": "v" }],
    ["numbers", { nan: NaN, inf: -Infinity, zero: -0, big: 1e21, tiny: 1e-7 }],
    ["top-level primitives", "just a string"],
    ["top-level null", null],
  ])("matches the previous digest: %s", (_name, value) => {
    expect(createFounderRuntimeSemanticDigest(value)).toBe(referenceDigest(value));
  });

  it("matches the previous digest across randomized structures", () => {
    const random = prng(1009);
    const outcome = (digest, value) => { try { return { digest: digest(value) }; } catch { return { threw: true }; } };
    let compared = 0;
    for (let iteration = 0; iteration < 500; iteration += 1) {
      const value = randomValue(random);
      // A top-level undefined, function or symbol is rejected by both.
      const expected = outcome(referenceDigest, value);
      expect(outcome(createFounderRuntimeSemanticDigest, value)).toEqual(expected);
      if (expected.digest) compared += 1;
    }
    expect(compared).toBeGreaterThan(300);
  });

  it("matches the previous digest for a store larger than one hashing chunk", () => {
    const random = prng(2026);
    const store = {
      revision: 12,
      analyses: Array.from({ length: 400 }, (_, index) => ({ id: `analysis_${index}`, text: "🧬".repeat(97) + "x".repeat(400), nested: randomValue(random) })),
      dailyBriefings: Array.from({ length: 40 }, (_, index) => ({ id: `briefing_${index}`, body: "lorem ipsum ".repeat(900) })),
    };
    expect(createFounderRuntimeSemanticDigest(store)).toBe(referenceDigest(store));
  });

  it("still rejects a top-level value the previous implementation rejected", () => {
    expect(() => createFounderRuntimeSemanticDigest(undefined)).toThrow();
    expect(() => referenceDigest(undefined)).toThrow();
  });
});
