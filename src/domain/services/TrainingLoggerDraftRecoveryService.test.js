import { describe, expect, it, vi } from "vitest";
import {
  discardTrainingLoggerRecoveryDraft,
  loadTrainingLoggerRecoveryDraft,
  saveTrainingLoggerRecoveryDraft,
  TRAINING_LOGGER_DRAFT_STORAGE_KEY,
} from "./TrainingLoggerDraftRecoveryService";

describe("TrainingLoggerDraftRecoveryService", () => {
  it("saves and resumes only the recoverable local draft", () => {
    const values = new Map();
    const storage = createStorage(values);
    const draft = { draftId: "draft_1", mode: "live", step: "logger" };

    expect(saveTrainingLoggerRecoveryDraft(storage, draft)).toBe(true);
    expect(loadTrainingLoggerRecoveryDraft(storage)).toEqual(draft);
    expect([...values.keys()]).toEqual([TRAINING_LOGGER_DRAFT_STORAGE_KEY]);
  });

  it("cancels by removing only the local draft and has no canonical dependency", () => {
    const values = new Map([
      [TRAINING_LOGGER_DRAFT_STORAGE_KEY, JSON.stringify({ draftId: "draft_1" })],
      ["unrelated", "keep"],
    ]);
    const storage = createStorage(values);

    expect(discardTrainingLoggerRecoveryDraft(storage)).toBe(true);
    expect(values.has(TRAINING_LOGGER_DRAFT_STORAGE_KEY)).toBe(false);
    expect(values.get("unrelated")).toBe("keep");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("discards invalid recovery JSON without touching unrelated storage", () => {
    const values = new Map([
      [TRAINING_LOGGER_DRAFT_STORAGE_KEY, "{"],
      ["unrelated", "keep"],
    ]);
    const storage = createStorage(values);

    expect(loadTrainingLoggerRecoveryDraft(storage)).toBeNull();
    expect(values.get("unrelated")).toBe("keep");
  });
});

function createStorage(values) {
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
    removeItem: vi.fn((key) => values.delete(key)),
  };
}
