"use client";

import { useMemo } from "react";
import Card from "../components/ui/Card";
import { formatSupportSchedulePreview } from "../domain/models/SupportScheduleModel";

const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function isSupportScheduleReady(schedule = {}) {
  return Boolean(
    schedule.startDate &&
      (["daily", "every_x_days"].includes(schedule.frequency) ||
        schedule.daysOfWeek?.length)
  );
}

export default function SupportScheduleEditor({ number = "1", onChange, schedule }) {
  const preview = useMemo(
    () => formatSupportSchedulePreview(schedule),
    [schedule]
  );
  const set = (key, value) => onChange({ ...schedule, [key]: value });

  return (
    <SupportEditorSection number={number} title="Schedule">
      <SupportQuestion label="How often?">
        <SupportSelect
          onChange={(event) => set("frequency", event.target.value)}
          options={[
            ["daily", "Daily"],
            ["weekly", "Weekly"],
            ["specific_days", "Specific days"],
            ["every_x_days", "Every X days"],
          ]}
          value={schedule.frequency}
        />
      </SupportQuestion>
      {schedule.frequency === "weekly" && (
        <SupportQuestion label="Which day?">
          <SupportSelect
            onChange={(event) => set("daysOfWeek", [event.target.value])}
            options={DAYS.map((day) => [day, capitalize(day)])}
            value={schedule.daysOfWeek[0] ?? ""}
          />
        </SupportQuestion>
      )}
      {schedule.frequency === "specific_days" && (
        <SupportQuestion label="Which days?">
          <div className="grid grid-cols-2 gap-2">
            {DAYS.map((day) => (
              <SupportCheck
                checked={schedule.daysOfWeek.includes(day)}
                key={day}
                label={capitalize(day)}
                onChange={(checked) =>
                  set(
                    "daysOfWeek",
                    checked
                      ? [...schedule.daysOfWeek, day]
                      : schedule.daysOfWeek.filter((item) => item !== day)
                  )
                }
              />
            ))}
          </div>
        </SupportQuestion>
      )}
      {schedule.frequency === "every_x_days" && (
        <SupportQuestion label="Repeat interval">
          <SupportField
            min="1"
            onChange={(event) => set("intervalDays", Number(event.target.value))}
            type="number"
            value={schedule.intervalDays}
          />
        </SupportQuestion>
      )}
      <SupportQuestion label="When?">
        <SupportSelect
          onChange={(event) => set("timing", event.target.value)}
          options={[
            ["morning", "Morning"],
            ["afternoon", "Afternoon"],
            ["evening", "Evening"],
            ["specific", "Specific time"],
          ]}
          value={schedule.timing}
        />
      </SupportQuestion>
      {schedule.timing === "specific" && (
        <SupportQuestion label="Local time">
          <SupportField
            onChange={(event) => set("specificTime", event.target.value)}
            type="time"
            value={schedule.specificTime}
          />
        </SupportQuestion>
      )}
      <SupportQuestion label="Starts">
        <SupportField
          onChange={(event) => set("startDate", event.target.value)}
          type="date"
          value={schedule.startDate}
        />
      </SupportQuestion>
      <SupportQuestion label="Ends">
        <div className="grid grid-cols-2 gap-2">
          <SupportChoice
            active={!schedule.endDate}
            label="Until changed"
            onClick={() => set("endDate", null)}
          />
          <SupportChoice
            active={Boolean(schedule.endDate)}
            label="Choose date"
            onClick={() => set("endDate", schedule.endDate ?? schedule.startDate)}
          />
        </div>
        {schedule.endDate && (
          <SupportField
            className="mt-2"
            onChange={(event) => set("endDate", event.target.value)}
            type="date"
            value={schedule.endDate}
          />
        )}
      </SupportQuestion>
      <SupportPreview lines={[preview]} title="Schedule preview" />
    </SupportEditorSection>
  );
}

export function SupportEditorSection({ children, number, title }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-extrabold text-white">
          {number}
        </span>
        <h2 className="text-xl font-extrabold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

export function SupportQuestion({ children, label }) {
  return <div><p className="mb-2 text-sm font-extrabold">{label}</p>{children}</div>;
}

export function SupportField({ className = "", ...props }) {
  return <input {...props} className={`${className} min-h-11 w-full rounded-xl border border-[var(--divider)] bg-white px-3 text-sm font-semibold`} />;
}

export function SupportSelect({ options, ...props }) {
  return <select {...props} className="min-h-11 w-full rounded-xl border border-[var(--divider)] bg-white px-3 text-sm font-semibold">{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>;
}

export function SupportChoice({ active, label, onClick }) {
  return <button className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${active ? "border-[var(--primary)] bg-blue-50 text-[var(--primary)]" : "border-[var(--divider)]"}`} onClick={onClick} type="button">{label}</button>;
}

export function SupportCheck({ checked, label, onChange }) {
  return <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--divider)] px-3 text-sm font-semibold"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>;
}

export function SupportPreview({ lines, title }) {
  return <div className="rounded-2xl bg-[var(--surface-muted)] p-3"><p className="text-[10px] font-extrabold uppercase tracking-[.08em] text-[var(--text-muted)]">{title}</p><div className="mt-2 space-y-1">{lines.map((line, index) => <p className="text-sm font-semibold leading-5" key={`${line}-${index}`}>{line}</p>)}</div></div>;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
