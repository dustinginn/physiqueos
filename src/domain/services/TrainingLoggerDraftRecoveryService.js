export const TRAINING_LOGGER_DRAFT_STORAGE_KEY =
  "physiqueos.training-logger.web-v1.draft";

export function loadTrainingLoggerRecoveryDraft(storage) {
  try {
    const stored = storage?.getItem?.(TRAINING_LOGGER_DRAFT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    discardTrainingLoggerRecoveryDraft(storage);
    return null;
  }
}

export function saveTrainingLoggerRecoveryDraft(storage, draft) {
  if (!storage?.setItem || !draft) return false;
  storage.setItem(TRAINING_LOGGER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  return true;
}

export function discardTrainingLoggerRecoveryDraft(storage) {
  if (!storage?.removeItem) return false;
  storage.removeItem(TRAINING_LOGGER_DRAFT_STORAGE_KEY);
  return true;
}
