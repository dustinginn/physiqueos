import MorningCheckInScreen from "../../../screens/MorningCheckInScreen";
import { saveMorningCheckIn } from "./actions";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";

export const dynamic = "force-dynamic";

export default async function MorningCheckInPage() {
  const user = await FounderRepositories.users.getCurrentUser();
  const [reminders, checkIns, weightEntries] = await Promise.all([
    FounderRepositories.reminders.listActiveReminders(user.id),
    FounderRepositories.dailyCheckIns.listCheckIns(user.id),
    FounderRepositories.weights.listWeightEntries(user.id),
  ]);
  const reconciliationItems = getReconciliationItems({
    checkIns,
    reminders,
    weightEntries,
  });

  return (
    <MorningCheckInScreen
      action={saveMorningCheckIn}
      reconciliationItems={reconciliationItems}
    />
  );
}

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function getReconciliationItems({ checkIns = [], reminders = [], weightEntries = [] }) {
  const now = new Date();

  return reminders
    .filter((reminder) => isRecurringReminder(reminder))
    .map((reminder) => {
      const occurrence = getMostRecentUnresolvedOccurrence({
        checkIns,
        now,
        reminder,
        weightEntries,
      });

      if (!occurrence) return null;

      return {
        id: reminder.id,
        title: reminder.title,
        date: occurrence.date,
        dateLabel: occurrence.label,
        type: reminder.type,
        linkedEvidenceType: reminder.linkedEvidenceType,
      };
    })
    .filter(Boolean);
}

function getMostRecentUnresolvedOccurrence({ checkIns, now, reminder, weightEntries }) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const cursor = new Date(now);

    cursor.setDate(now.getDate() - offset);

    const date = toDateKey(cursor);
    const dayName = DAY_NAMES[cursor.getDay()];

    if (!reminderAppliesOn(reminder, dayName)) continue;
    if (isSameLocalDate(reminder.completedAt, date)) return null;
    if (hasEvidenceForOccurrence({ checkIns, date, reminder, weightEntries })) return null;
    if (hasReconciliationFor({ checkIns, date, reminderId: reminder.id })) return null;

    return {
      date,
      label: offset === 1 ? "yesterday" : formatShortDate(cursor),
    };
  }

  return null;
}

function hasEvidenceForOccurrence({ checkIns, date, reminder, weightEntries }) {
  if (
    reminder.linkedEvidenceType === "weight" ||
    reminder.linkedEntityType === "weight_entry" ||
    reminder.id === "reminder_morning_weight"
  ) {
    const hasWeight = weightEntries.some(
      (entry) => entry.measuredAt?.slice(0, 10) === date
    );
    const hasCheckInWeight = checkIns.some(
      (checkIn) => checkIn.date === date && Boolean(checkIn.weightEntryId)
    );

    return hasWeight || hasCheckInWeight;
  }

  return false;
}

function hasReconciliationFor({ checkIns, date, reminderId }) {
  const checkIn = checkIns.find((item) => item.date === date);

  return Boolean(
    checkIn?.reconciliation?.some((item) => item.reminderId === reminderId)
  );
}

function isRecurringReminder(reminder) {
  const schedule = reminder.schedule ?? {};

  return Boolean(
    schedule.type === "daily" ||
      schedule.cadence === "daily" ||
      schedule.daysOfWeek?.length ||
      schedule.dayOfWeek
  );
}

function reminderAppliesOn(reminder, dayName) {
  const schedule = reminder.schedule ?? {};

  if (schedule.type === "daily" || schedule.cadence === "daily") return true;
  if (schedule.daysOfWeek?.length) return schedule.daysOfWeek.includes(dayName);

  return schedule.dayOfWeek === dayName;
}

function isSameLocalDate(value, dateKey) {
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value === dateKey;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) === dateKey;

  return toDateKey(date) === dateKey;
}

function toDateKey(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatShortDate(value) {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
