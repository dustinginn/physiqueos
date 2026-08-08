"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import SupportScheduleEditor, {
  isSupportScheduleReady,
  SupportChoice,
  SupportEditorSection,
} from "./SupportScheduleEditor";

const initialState = { message: null };

export default function RecurringSupportEditorScreen({
  action,
  backHref,
  contextLabel = "Recovery Support",
  helperCopy = "Set the recurring schedule and in-app reminder for this recovery method.",
  hydration,
  protocol,
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [schedule, setSchedule] = useState(hydration.supportSchedule);
  const [reminder, setReminder] = useState(hydration.reminderPreference);
  const scheduleReady = isSupportScheduleReady(schedule);

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pb-28 pt-10">
        <Link
          className="mb-6 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--text-secondary)]"
          href={backHref ?? `/profile/protocols/${encodeURIComponent(protocol.id)}?from=operating-plan`}
        >
          â† {protocol.name}
        </Link>
        <header className="mb-6">
          <p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[var(--primary)]">
            {contextLabel}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Edit Support</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {helperCopy}
          </p>
        </header>
        <form action={formAction} className="space-y-4">
          <input
            name="supportScheduleJson"
            type="hidden"
            value={JSON.stringify(schedule)}
          />
          <SupportScheduleEditor onChange={setSchedule} schedule={schedule} />
          {scheduleReady && (
            <SupportEditorSection number="2" title="Reminder">
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                Use this Support schedule for the in-app reminder.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <SupportChoice
                  active={reminder === "remind"}
                  label="Remind me"
                  onClick={() => setReminder("remind")}
                />
                <SupportChoice
                  active={reminder === "none"}
                  label="No reminder"
                  onClick={() => setReminder("none")}
                />
              </div>
              <input
                name="reminderPreference"
                type="hidden"
                value={reminder}
              />
            </SupportEditorSection>
          )}
          {scheduleReady && reminder && (
            <SupportEditorSection number="3" title="Execution Notes">
              <label className="text-sm font-bold" htmlFor="notes">
                Optional notes shown when this priority is opened
              </label>
              <textarea
                className="mt-2 min-h-28 w-full rounded-2xl border border-[var(--divider)] bg-white p-3 text-sm"
                defaultValue={hydration.notes}
                id="notes"
                maxLength={1000}
                name="notes"
                placeholder="Add focus areas or technique reminders."
              />
            </SupportEditorSection>
          )}
          {state?.message && (
            <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {state.message}
            </p>
          )}
          <button
            className="min-h-12 w-full rounded-2xl bg-[var(--primary)] font-extrabold text-white disabled:opacity-50"
            disabled={pending || !scheduleReady || !reminder}
            type="submit"
          >
            {pending ? "Savingâ€¦" : "Save Support"}
          </button>
        </form>
      </div>
    </main>
  );
}
