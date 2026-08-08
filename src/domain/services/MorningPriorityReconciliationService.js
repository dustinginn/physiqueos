import { createDailyCheckIn } from "../models/dailyCheckIn";
import { getPreviousLocalDayWindow } from "../utils/localDate";
import {
  createPriorityOccurrenceKey,
  getPreviousDayIncompletePrioritySelection,
} from "./DailyFocusService";

export const MORNING_PRIORITY_RECONCILIATION_DISPOSITIONS = Object.freeze([
  "completed",
  "skipped",
  "note",
]);

const SUPPORTED_DISPOSITIONS = new Set(
  MORNING_PRIORITY_RECONCILIATION_DISPOSITIONS
);

export class MorningPriorityReconciliationValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "MorningPriorityReconciliationValidationError";
    this.code = code;
  }
}

export function parseMorningPriorityReconciliationFormData(formData) {
  return formData.getAll("reconciliationKeys").map((value) => {
    const occurrenceKey = String(value ?? "").trim();

    return {
      occurrenceKey,
      priorityId: String(
        formData.get(`${occurrenceKey}_priorityId`) ?? ""
      ).trim(),
      occurrenceDate: String(
        formData.get(`${occurrenceKey}_date`) ?? ""
      ).trim(),
      disposition: String(
        formData.get(`${occurrenceKey}_status`) ?? ""
      ).trim(),
      note: normalizeOptionalText(formData.get(`${occurrenceKey}_note`)),
    };
  });
}

export function createMorningPriorityReconciliationService({
  repositories,
  now = () => new Date(),
} = {}) {
  if (!repositories) {
    throw new Error("Morning priority reconciliation repositories are required.");
  }

  return {
    async getSelection({ userId, timeZone, at = now() }) {
      const window = getPreviousLocalDayWindow({ now: at, timeZone });
      const inputs = await loadSelectionInputs(
        repositories,
        userId,
        window.previousLocalDate
      );

      return getPreviousDayIncompletePrioritySelection({
        ...inputs,
        now: at,
        timeZone,
      });
    },

    async save({
      userId,
      timeZone,
      submissions = [],
      at = now(),
    }) {
      const window = getPreviousLocalDayWindow({ now: at, timeZone });
      const inputs = await loadSelectionInputs(
        repositories,
        userId,
        window.previousLocalDate
      );
      const selection = getPreviousDayIncompletePrioritySelection({
        ...inputs,
        now: at,
        timeZone,
      });
      const normalizedSubmissions = submissions.map(normalizeSubmission);
      const validation = validateSubmissions({
        checkIns: inputs.checkIns,
        selection,
        submissions: normalizedSubmissions,
      });

      if (validation.pendingItems.length > 0) {
        throw new MorningPriorityReconciliationValidationError(
          "Choose an outcome for each unfinished priority.",
          "missing_disposition"
        );
      }

      if (validation.writes.length === 0) {
        return {
          selection,
          persisted: [],
          idempotent: validation.idempotent,
        };
      }

      const previousDate = selection.window.previousLocalDate;
      const recordedAt = toDate(at).toISOString();
      const existingCheckIn = inputs.checkIns.find(
        (checkIn) => checkIn.date === previousDate
      );
      const checkIn = existingCheckIn ?? createReconciliationCheckIn({
        date: previousDate,
        recordedAt,
        userId,
      });
      const reconciliationByKey = new Map(
        (checkIn.reconciliation ?? []).map((item) => [
          createPriorityOccurrenceKey(
            item.reminderId,
            item.occurrenceDate ?? checkIn.date
          ),
          item,
        ])
      );

      for (const submission of validation.writes) {
        reconciliationByKey.set(submission.occurrenceKey, {
          key: submission.occurrenceKey,
          reminderId: submission.priorityId,
          occurrenceDate: submission.occurrenceDate,
          status: submission.disposition,
          note: submission.note,
          recordedAt,
        });
      }

      await repositories.dailyCheckIns.saveCheckIn({
        ...checkIn,
        reconciliation: [...reconciliationByKey.values()],
        updatedAt: recordedAt,
      });

      for (const submission of validation.writes) {
        if (submission.disposition === "completed") {
          await repositories.reminders.completeReminder(
            submission.priorityId,
            `${submission.occurrenceDate}T20:00:00`
          );
        }
      }

      return {
        selection,
        persisted: validation.writes.map((item) => item.occurrenceKey),
        idempotent: validation.idempotent,
      };
    },
  };
}

function validateSubmissions({ checkIns, selection, submissions }) {
  const eligibleByKey = new Map(
    selection.items.map((item) => [item.occurrenceKey, item])
  );
  const submittedKeys = new Set();
  const writes = [];
  const idempotent = [];

  for (const submission of submissions) {
    validateSubmissionShape(submission, selection.window);

    if (submittedKeys.has(submission.occurrenceKey)) {
      throw new MorningPriorityReconciliationValidationError(
        "Each priority occurrence may be submitted only once.",
        "duplicate_occurrence"
      );
    }
    submittedKeys.add(submission.occurrenceKey);

    const eligible = eligibleByKey.get(submission.occurrenceKey);
    if (eligible?.id === submission.priorityId) {
      writes.push(submission);
      continue;
    }

    const existing = findExistingReconciliation(
      checkIns,
      submission.occurrenceDate,
      submission.priorityId
    );
    if (isEquivalentReconciliation(existing, submission)) {
      idempotent.push(submission.occurrenceKey);
      continue;
    }

    throw new MorningPriorityReconciliationValidationError(
      "This priority occurrence is not eligible for reconciliation.",
      "ineligible_occurrence"
    );
  }

  return {
    writes,
    idempotent,
    pendingItems: selection.items.filter(
      (item) => !submittedKeys.has(item.occurrenceKey)
    ),
  };
}

function validateSubmissionShape(submission, window) {
  if (!submission.priorityId || !submission.occurrenceKey) {
    throw new MorningPriorityReconciliationValidationError(
      "A valid priority occurrence is required.",
      "invalid_occurrence"
    );
  }
  if (submission.occurrenceDate !== window.previousLocalDate) {
    throw new MorningPriorityReconciliationValidationError(
      "The submitted priority date must be yesterday in the user timezone.",
      "invalid_occurrence_date"
    );
  }
  if (
    submission.occurrenceKey !==
    createPriorityOccurrenceKey(
      submission.priorityId,
      submission.occurrenceDate
    )
  ) {
    throw new MorningPriorityReconciliationValidationError(
      "The priority occurrence identity is invalid.",
      "invalid_occurrence_key"
    );
  }
  if (!SUPPORTED_DISPOSITIONS.has(submission.disposition)) {
    throw new MorningPriorityReconciliationValidationError(
      "The selected priority outcome is not supported.",
      "unsupported_disposition"
    );
  }
}

async function loadSelectionInputs(repositories, userId, previousLocalDate) {
  const [
    reminders,
    checkIns,
    dexaScans,
    progressPhotos,
    weightEntries,
  ] = await Promise.all([
    repositories.reminders.listReminders(userId),
    repositories.dailyCheckIns.listCheckIns(userId, {
      from: previousLocalDate,
      to: previousLocalDate,
    }),
    repositories.dexaScans?.listDEXAScans?.(userId) ?? [],
    repositories.progressPhotos?.listPhotos?.(userId, {
      from: previousLocalDate,
      to: previousLocalDate,
    }) ?? [],
    repositories.weights?.listWeightEntries?.(userId, {
      from: previousLocalDate,
      to: `${previousLocalDate}T23:59:59.999`,
    }) ?? [],
  ]);

  return {
    reminders,
    checkIns,
    dexaScans,
    progressPhotos,
    weightEntries,
  };
}

function createReconciliationCheckIn({ date, recordedAt, userId }) {
  return createDailyCheckIn({
    id: `daily_check_in_${date.replaceAll("-", "_")}`,
    userId,
    date,
    source: {
      type: "manual",
      name: "Morning Reconciliation",
      externalId: null,
      importedAt: null,
      confidence: "medium",
      notes: "Founder Alpha morning reconciliation.",
    },
    fieldProvenance: {
      imported: ["reconciliation"],
      computed: [],
    },
    createdAt: recordedAt,
    updatedAt: recordedAt,
  });
}

function findExistingReconciliation(checkIns, date, priorityId) {
  const checkIn = checkIns.find((item) => item.date === date);

  return (checkIn?.reconciliation ?? []).find(
    (item) =>
      item.reminderId === priorityId &&
      (item.occurrenceDate ?? date) === date
  );
}

function isEquivalentReconciliation(existing, submission) {
  return (
    existing &&
    String(existing.status ?? "") === submission.disposition &&
    normalizeOptionalText(existing.note) === submission.note
  );
}

function normalizeSubmission(submission = {}) {
  return {
    occurrenceKey: String(submission.occurrenceKey ?? "").trim(),
    priorityId: String(submission.priorityId ?? "").trim(),
    occurrenceDate: String(submission.occurrenceDate ?? "").trim(),
    disposition: String(
      submission.disposition ?? submission.status ?? ""
    ).trim(),
    note: normalizeOptionalText(submission.note),
  };
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();

  return text || null;
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("A valid reconciliation instant is required.");
  }

  return date;
}
