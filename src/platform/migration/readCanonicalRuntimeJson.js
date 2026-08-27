import fs from "node:fs";

const DEFAULT_CHUNK_BYTES = 64 * 1024;

export async function readCanonicalRuntimeJson(runtimeFile, {
  observePhase = async () => undefined,
  highWaterMark = DEFAULT_CHUNK_BYTES,
} = {}) {
  await observePhase("CANONICAL_FILE_READ_STARTED");
  await observePhase("CANONICAL_JSON_PARSE_STARTED", { processing: "streamed-top-level-collections" });
  const parser = createTopLevelObjectParser();
  let byteLength = 0;
  const stream = fs.createReadStream(runtimeFile, { encoding: "utf8", highWaterMark });
  for await (const chunk of stream) {
    byteLength += Buffer.byteLength(chunk);
    parser.consume(chunk);
  }
  const parsed = parser.finish();
  await observePhase("CANONICAL_FILE_READ_COMPLETE", {
    byteLength,
    processing: "streamed-top-level-collections",
  });
  await observePhase("CANONICAL_JSON_PARSE_COMPLETE", {
    collectionCount: parsed.collectionCount,
    maximumValueCharacters: parsed.maximumValueCharacters,
    processing: "streamed-top-level-collections",
  });
  return parsed.value;
}

function createTopLevelObjectParser() {
  const value = {};
  const keys = new Set();
  let state = "start";
  let currentKey = null;
  let keyParts = [];
  let valueParts = [];
  let tokenStart = null;
  let escaped = false;
  let inString = false;
  let containers = [];
  let complete = false;
  let maximumValueCharacters = 0;
  let allowObjectEnd = true;

  function consume(chunk) {
    if (complete && chunk.trim()) throw new SyntaxError("Canonical runtime has trailing JSON content.");
    let index = 0;
    if (state === "key" || state === "value") tokenStart = 0;
    while (index < chunk.length) {
      const character = chunk[index];
      if (state === "end") {
        if (!whitespace(character)) throw new SyntaxError("Canonical runtime has trailing JSON content.");
        index += 1;
        continue;
      }
      if (state === "start") {
        if (whitespace(character)) { index += 1; continue; }
        if (character !== "{") throw new SyntaxError("Canonical runtime must be a top-level JSON object.");
        state = "key-or-end";
        index += 1;
        continue;
      }
      if (state === "key-or-end") {
        if (whitespace(character)) { index += 1; continue; }
        if (character === "}") {
          if (!allowObjectEnd) throw new SyntaxError("Canonical runtime contains a trailing object separator.");
          complete = true; state = "end"; index += 1; continue;
        }
        if (character !== '"') throw new SyntaxError("Canonical runtime object keys must be JSON strings.");
        state = "key";
        keyParts = [];
        tokenStart = index;
        escaped = false;
        index += 1;
        continue;
      }
      if (state === "key") {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') {
          index += 1;
          keyParts.push(chunk.slice(tokenStart, index));
          tokenStart = null;
          currentKey = JSON.parse(keyParts.join(""));
          keyParts = [];
          if (keys.has(currentKey)) throw new SyntaxError(`Canonical runtime contains duplicate collection ${currentKey}.`);
          state = "colon";
          continue;
        }
        index += 1;
        continue;
      }
      if (state === "colon") {
        if (whitespace(character)) { index += 1; continue; }
        if (character !== ":") throw new SyntaxError("Canonical runtime collection key is missing a value separator.");
        state = "value-start";
        index += 1;
        continue;
      }
      if (state === "value-start") {
        if (whitespace(character)) { index += 1; continue; }
        state = "value";
        valueParts = [];
        tokenStart = index;
        escaped = false;
        inString = false;
        containers = [];
        continue;
      }
      if (state === "value") {
        if (inString) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') inString = false;
          index += 1;
          continue;
        }
        if (character === '"') { inString = true; index += 1; continue; }
        if (character === "{" || character === "[") { containers.push(character); index += 1; continue; }
        if (character === "]") {
          if (containers.at(-1) !== "[") throw new SyntaxError("Canonical runtime contains mismatched JSON containers.");
          containers.pop();
          index += 1;
          continue;
        }
        if (character === "}" && containers.length) {
          if (containers.at(-1) !== "{") throw new SyntaxError("Canonical runtime contains mismatched JSON containers.");
          containers.pop();
          index += 1;
          continue;
        }
        if (!containers.length && (character === "," || character === "}")) {
          valueParts.push(chunk.slice(tokenStart, index));
          tokenStart = null;
          finishValue();
          if (character === ",") { state = "key-or-end"; allowObjectEnd = false; }
          else { complete = true; state = "end"; }
          index += 1;
          continue;
        }
        index += 1;
      }
    }
    if (tokenStart != null) {
      const segment = chunk.slice(tokenStart);
      if (state === "key") keyParts.push(segment);
      else if (state === "value") valueParts.push(segment);
      tokenStart = null;
    }
  }

  function finishValue() {
    const text = valueParts.join("");
    valueParts = [];
    if (!text.trim()) throw new SyntaxError(`Canonical runtime collection ${currentKey} has no value.`);
    const parsed = JSON.parse(text);
    maximumValueCharacters = Math.max(maximumValueCharacters, text.length);
    Object.defineProperty(value, currentKey, { value: parsed, enumerable: true, configurable: true, writable: true });
    keys.add(currentKey);
    currentKey = null;
  }

  return Object.freeze({
    consume,
    finish() {
      if (!complete || state !== "end") throw new SyntaxError("Canonical runtime JSON ended before its top-level object completed.");
      return Object.freeze({ value, collectionCount: keys.size, maximumValueCharacters });
    },
  });
}

function whitespace(character) {
  return character === " " || character === "\t" || character === "\r" || character === "\n";
}
