"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Card from "../components/ui/Card";
import SupportScheduleEditor, {
  isSupportScheduleReady,
  SupportChoice,
  SupportEditorSection,
  SupportField,
  SupportQuestion,
} from "./SupportScheduleEditor";

export default function SupplementSupportEditorScreen({ action, hydration, protocol }) {
  const [state, formAction] = useActionState(action, { message: null, values: null });
  const initial = normalizeEditorValue(state?.values ?? hydration.draft);
  const [supportSchedule, setSupportSchedule] = useState(initial.supportSchedule);
  const [reminderPreference, setReminderPreference] = useState(initial.reminderPreference);

  if (hydration.compatibilityIssue) {
    return (
      <main className="app-surface min-h-screen">
        <div className="mx-auto max-w-[393px] space-y-5 px-4 pb-28 pt-10">
          <BackLink protocolId={protocol.id} />
          <Header name={protocol.name} />
          <Card>
            <p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">
              {hydration.compatibilityIssue} Your existing schedule has not been changed.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="app-surface min-h-screen">
      <form action={formAction} className="mx-auto max-w-[393px] space-y-5 px-4 pb-28 pt-10">
        <BackLink protocolId={protocol.id} />
        <Header name={protocol.name} />
        {state?.message && (
          <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-sm font-semibold">
            {state.message}
          </p>
        )}

        <SupportEditorSection number="1" title="Dose / Quantity">
          <div className="grid grid-cols-2 gap-3">
            <SupportQuestion label="Amount">
              <SupportField defaultValue={initial.dose.amount} name="doseAmount" />
            </SupportQuestion>
            <SupportQuestion label="Unit">
              <SupportField
                defaultValue={initial.dose.unit}
                name="doseUnit"
                placeholder="capsules, mg, scoop"
              />
            </SupportQuestion>
          </div>
          <p className="text-xs font-semibold leading-5 text-[var(--text-secondary)]">
            Optional. Use the quantity and unit that make sense for this supplement.
          </p>
        </SupportEditorSection>

        <SupportScheduleEditor
          number="2"
          onChange={setSupportSchedule}
          schedule={supportSchedule}
        />

        <SupportEditorSection number="3" title="Reminder">
          <div className="grid grid-cols-2 gap-2">
            <SupportChoice
              active={reminderPreference === "remind"}
              label="Remind me"
              onClick={() => setReminderPreference("remind")}
            />
            <SupportChoice
              active={reminderPreference === "none"}
              label="No reminder"
              onClick={() => setReminderPreference("none")}
            />
          </div>
        </SupportEditorSection>

        <SupportEditorSection number="4" title="Execution Notes">
          <textarea
            className="min-h-28 w-full rounded-xl border border-[var(--divider)] bg-white p-3 text-sm"
            defaultValue={initial.notes}
            maxLength={1000}
            name="notes"
            placeholder="Optional context, such as take with food or mix with water"
          />
        </SupportEditorSection>

        <input
          name="supportScheduleJson"
          type="hidden"
          value={JSON.stringify(supportSchedule)}
        />
        <input name="reminderPreference" type="hidden" value={reminderPreference} />
        <SaveButton disabled={!isSupportScheduleReady(supportSchedule)} />
      </form>
    </main>
  );
}

function BackLink({ protocolId }) {
  return (
    <Link
      className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--text-secondary)]"
      href={`/profile/protocols/${encodeURIComponent(protocolId)}?from=operating-plan`}
    >
      ← Supplement Strategy
    </Link>
  );
}

function Header({ name }) {
  return (
    <header>
      <p className="text-xs font-extrabold uppercase tracking-widest text-[var(--primary)]">
        Edit Support
      </p>
      <h1 className="mt-2 text-3xl font-extrabold">{name}</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
        Keep the quantity, schedule, reminder, and optional context aligned with your current strategy.
      </p>
    </header>
  );
}

function SaveButton({ disabled }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-12 w-full rounded-2xl bg-[var(--primary)] font-extrabold text-white disabled:opacity-60"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Saving…" : "Save Support"}
    </button>
  );
}

function normalizeEditorValue(value = {}) {
  return {
    dose: {
      amount: String(value.dose?.amount ?? ""),
      unit: String(value.dose?.unit ?? ""),
    },
    supportSchedule: {
      frequency: value.supportSchedule?.frequency ?? "daily",
      daysOfWeek: [...(value.supportSchedule?.daysOfWeek ?? [])],
      intervalDays: value.supportSchedule?.intervalDays ?? 1,
      timing: value.supportSchedule?.timing ?? "morning",
      specificTime: value.supportSchedule?.specificTime ?? "",
      startDate: value.supportSchedule?.startDate ?? "",
      endDate: value.supportSchedule?.endDate ?? null,
    },
    reminderPreference: value.reminderPreference === "remind" ? "remind" : "none",
    notes: String(value.notes ?? ""),
  };
}
