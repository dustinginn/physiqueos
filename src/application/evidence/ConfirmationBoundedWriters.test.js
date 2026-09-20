import { describe, expect, it, vi } from "vitest";
import {
  CONFIRMATION_ANALYSIS_COLLECTIONS,
  CONFIRMATION_PROGRESS_PHOTO_COLLECTIONS,
  createConfirmationAnalysisWriter,
  createConfirmationProgressPhotoWriter,
} from "./ConfirmationBoundedWriters.js";
import { createAnalysis } from "../../domain/models/analysis.js";

function boundedBindings(collections) {
  const calls = [];
  return {
    calls,
    bindings: {
      async mutateCanonicalRuntime(input) {
        calls.push({ ...input, mutate: undefined });
        const candidate = Object.fromEntries(input.readCollections.map((name) => [name, [...(collections[name] ?? [])]]));
        const result = await input.mutate(candidate, { commandId: "c" });
        for (const name of input.allowedCollections) collections[name] = candidate[name];
        return { committed: true, result: structuredClone(result) };
      },
    },
  };
}

const analysis = (id, target = id) => createAnalysis({
  id, createdAt: "2026-09-20T15:00:00.000Z", title: id, summary: id, evidenceIds: [target], evidenceTypes: ["photo_session"],
});

describe("confirmation analysis writer", () => {
  it("persists a batch in one write that names only the analyses collection", async () => {
    const collections = { analyses: [] };
    const { calls, bindings } = boundedBindings(collections);
    const persist = createConfirmationAnalysisWriter({ repositories: {}, loadCanonicalCommitBindings: async () => bindings });
    await persist([analysis("a"), analysis("b"), analysis("c")]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      allowedCollections: CONFIRMATION_ANALYSIS_COLLECTIONS,
      readCollections: CONFIRMATION_ANALYSIS_COLLECTIONS,
      readApplicationContext: false,
      readImportMetadata: false,
      allowApplicationContextMutation: false,
    });
    expect(collections.analyses.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("replaces an analysis for the same evidence target instead of duplicating it", async () => {
    const collections = { analyses: [] };
    const { bindings } = boundedBindings(collections);
    const persist = createConfirmationAnalysisWriter({ repositories: {}, loadCanonicalCommitBindings: async () => bindings });
    await persist([analysis("first", "target")]);
    await persist([analysis("first", "target")]);
    expect(collections.analyses).toHaveLength(1);
  });

  it("writes nothing for an empty batch", async () => {
    const load = vi.fn();
    const persist = createConfirmationAnalysisWriter({ repositories: {}, loadCanonicalCommitBindings: load });
    await expect(persist([])).resolves.toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it("falls back to the repository only where no bounded runtime exists", async () => {
    const createAnalysisRecord = vi.fn(async (item) => item);
    const persist = createConfirmationAnalysisWriter({
      repositories: { analyses: { createAnalysis: createAnalysisRecord } },
      loadCanonicalCommitBindings: async () => ({}),
    });
    await persist([analysis("x"), analysis("y")]);
    expect(createAnalysisRecord).toHaveBeenCalledTimes(2);
  });
});

describe("confirmation progress photo writer", () => {
  const record = (id, imagePath) => ({ id, userId: "u", date: "2026-09-19", capturedAt: "2026-09-19", imagePath });

  it("writes new compatibility rows in one write that names only progressPhotos", async () => {
    const collections = { progressPhotos: [] };
    const { calls, bindings } = boundedBindings(collections);
    const persist = createConfirmationProgressPhotoWriter({ repositories: {}, loadCanonicalCommitBindings: async () => bindings });
    const written = await persist({ userId: "u", date: "2026-09-19", records: [record("p1", "media://a"), record("p2", "media://b")] });
    expect(written).toEqual(["p1", "p2"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].allowedCollections).toEqual(CONFIRMATION_PROGRESS_PHOTO_COLLECTIONS);
    expect(collections.progressPhotos).toHaveLength(2);
  });

  it("skips a photo whose retained image is already present so a replay writes nothing new", async () => {
    const collections = { progressPhotos: [record("p1", "media://a")] };
    const { bindings } = boundedBindings(collections);
    const persist = createConfirmationProgressPhotoWriter({ repositories: {}, loadCanonicalCommitBindings: async () => bindings });
    const written = await persist({ userId: "u", date: "2026-09-19", records: [record("p1", "media://a"), record("p2", "media://b")] });
    expect(written).toEqual(["p2"]);
    expect(collections.progressPhotos.map((item) => item.id)).toEqual(["p1", "p2"]);
    const replay = await persist({ userId: "u", date: "2026-09-19", records: [record("p1", "media://a"), record("p2", "media://b")] });
    expect(replay).toEqual([]);
    expect(collections.progressPhotos).toHaveLength(2);
  });

  it("uses the repository only where no bounded runtime exists", async () => {
    const stored = [];
    const persist = createConfirmationProgressPhotoWriter({
      repositories: { progressPhotos: {
        async getPhotosByDate() { return stored; },
        async upsertPhoto(item) { stored.push(item); return item; },
      } },
      loadCanonicalCommitBindings: async () => ({}),
    });
    await expect(persist({ userId: "u", date: "2026-09-19", records: [record("p1", "media://a")] })).resolves.toEqual(["p1"]);
  });
});
