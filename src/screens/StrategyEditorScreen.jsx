"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

export default function StrategyEditorScreen({ action, model }) {
  const [state, formAction] = useActionState(action, { message: null });
  const back = `/profile/operating-plan/strategy/${model.strategyType}/${encodeURIComponent(model.protocolId)}`;
  return <main className="app-surface min-h-screen"><form action={formAction} className="mx-auto max-w-[393px] space-y-6 px-4 pb-28 pt-10">
    <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--text-secondary)]" href={back}>← Strategy</Link>
    <header className="space-y-2"><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--primary)]">Operating Plan</p><h1 className="text-3xl font-extrabold text-[var(--text-primary)]">{model.title}</h1><p className="text-sm leading-6 text-[var(--text-secondary)]">{strategyHelper(model.strategyType)}</p></header>
    {state?.message&&<p aria-live="polite" className="rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] p-3 text-sm font-semibold text-[var(--text-secondary)]">{state.message}</p>}
    {model.strategyType === "briefings" ? <CoachingUpdatesFields model={model}/> : model.strategyType === "nutrition" ? <NutritionFields model={model}/> : <TrainingFields model={model}/>}
    <SubmitButton/>
  </form></main>;
}

function CoachingUpdatesFields({ model }) {
  return <div className="space-y-4">
    <CadenceSurface model={model} name="midweek" title="Midweek Calibration"/>
    <CadenceSurface model={model} name="weekly" title="Weekly Synthesis"/>
    <Section title="Monthly Review">
      <label className="flex min-h-12 items-center gap-3"><input defaultChecked={model.monthly.enabled} name="monthlyEnabled" type="checkbox"/><span className="text-sm font-bold">Enabled</span></label>
      <div><p className="mb-2 text-xs font-bold text-[var(--text-secondary)]">Monthly delivery rule</p><p className="rounded-xl bg-[var(--surface-muted)] px-3 py-3 text-sm font-semibold">Day 1 of each month</p></div>
      <TimeSelect defaultValue={model.monthly.localTime} label="Preferred delivery time" name="monthlyTime"/>
    </Section>
    <Section title="Progress Photos">
      <p className="text-sm leading-6 text-[var(--text-secondary)]">Choose when you plan to take progress photos, whether Home should remind you, and whether completed photo sessions should generate a Photo Event review.</p>
      <Select defaultValue={model.photos.cadence} label="Cadence" name="photoCadence" options={["weekly","weekly_interval_2"]}/>
      <Select defaultValue={model.photos.day} label="Preferred day" name="photoDay" options={model.options.weekdays}/>
      <Select defaultValue={model.photos.timeOfDay} label="Preferred time" name="photoTimeOfDay" options={model.photos.timeOptions}/>
      <div className="space-y-2 border-t border-[var(--divider)] pt-3"><p className="text-xs font-bold text-[var(--text-secondary)]">Reminder</p><label className="flex min-h-12 items-center gap-3"><input defaultChecked={model.photos.reminderEnabled} name="photoReminderEnabled" type="checkbox"/><span className="text-sm font-bold">Remind me about Progress Photos</span></label></div>
      <div className="space-y-2 border-t border-[var(--divider)] pt-3"><p className="text-xs font-bold text-[var(--text-secondary)]">Briefing</p>
      <label className="flex min-h-12 items-center gap-3"><input defaultChecked={model.eventBriefings.photo} name="photoEventBriefingEnabled" type="checkbox"/><span className="text-sm font-bold">Enable Photo Event briefing</span></label>
      </div>
    </Section>
    <Section title="DEXA">
      <p className="text-sm leading-6 text-[var(--text-secondary)]">Schedule your next scan and choose the in-app reminders that support it.</p>
      <div className="space-y-3"><p className="text-xs font-bold text-[var(--text-secondary)]">Appointment</p><Field defaultValue={model.dexa.plannedDate} label="Date" name="dexaPlannedDate" type="date"/><Field defaultValue={model.dexa.localTime} label="Time" name="dexaLocalTime" type="time"/><Field defaultValue={model.dexa.preparationNote} label="Preparation note (optional)" name="dexaPreparationNote" type="text"/></div>
      <div className="space-y-2 border-t border-[var(--divider)] pt-3"><p className="text-xs font-bold text-[var(--text-secondary)]">Reminders</p>
        <Checkbox defaultChecked={model.dexa.reminderPreferences.includes("week_before")} label="Remind me 1 week before" name="dexaReminderPreferences" value="week_before"/>
        <Checkbox defaultChecked={model.dexa.reminderPreferences.includes("day_before")} label="Remind me 1 day before" name="dexaReminderPreferences" value="day_before"/>
        <Checkbox defaultChecked={model.dexa.reminderPreferences.includes("morning_of")} label="Remind me the morning of" name="dexaReminderPreferences" value="morning_of"/>
        <Checkbox defaultChecked={model.dexa.uploadReminder} label="Remind me to upload results after the appointment" name="dexaUploadReminder"/>
      </div>
      <div className="space-y-2 border-t border-[var(--divider)] pt-3"><p className="text-xs font-bold text-[var(--text-secondary)]">Briefing</p><Checkbox defaultChecked={model.eventBriefings.dexa} label="Enable DEXA Event briefing" name="dexaEventBriefingEnabled"/></div>
    </Section>
    <Section title="Notifications">
      <label className="flex min-h-12 items-center gap-3"><input defaultChecked={model.notificationPreference==="notify_when_ready"} name="notificationPreference" type="radio" value="notify_when_ready"/><span className="text-sm font-bold">Notify me when an update is ready</span></label>
      <label className="flex min-h-12 items-center gap-3"><input defaultChecked={model.notificationPreference==="available_without_notification"} name="notificationPreference" type="radio" value="available_without_notification"/><span className="text-sm font-bold">Keep updates available without a notification</span></label>
    </Section>
  </div>;
}

function CadenceSurface({ model, name, title }) {
  const surface=model[name];
  return <Section title={title}>
    <label className="flex min-h-12 items-center gap-3"><input defaultChecked={surface.enabled} name={`${name}Enabled`} type="checkbox"/><span className="text-sm font-bold">Enabled</span></label>
    <Select defaultValue={surface.day} label="Day of week" name={`${name}Day`} options={model.options.weekdays}/>
    <TimeSelect defaultValue={surface.localTime} label="Preferred delivery time" name={`${name}Time`}/>
  </Section>;
}

function NutritionFields({ model }) {
  return <div className="space-y-4">
    <Section title="Protein target method"><label className="flex min-h-12 items-center gap-3"><input defaultChecked={model.proteinBasis==="body_weight"} name="proteinBasis" type="radio" value="body_weight"/><span className="text-sm font-bold">Grams per pound of body weight</span></label><label className="flex min-h-12 items-center gap-3"><input defaultChecked={model.proteinBasis==="fixed_grams"} name="proteinBasis" type="radio" value="fixed_grams"/><span className="text-sm font-bold">Fixed daily grams</span></label><Field defaultValue={model.proteinRatio} label="Multiplier (g/lb)" max="2" min="0.5" name="proteinRatio" step="0.05" type="number"/><Field defaultValue={model.fixedProtein??""} label="Fixed daily target (g)" max="400" min="50" name="fixedProtein" step="1" type="number"/></Section>
    <Section title="Macro approach"><Select defaultValue={model.carbohydrateStrategy} label="Carbohydrate approach" name="carbohydrateStrategy" options={model.options.carbohydrateStrategy}/><Select defaultValue={model.fatStrategy} label="Fat approach" name="fatStrategy" options={model.options.fatStrategy}/></Section>
  </div>;
}

function TrainingFields({ model }) {
  return <div className="space-y-4">
    <Section title={`Weekly structure · ${model.weeklySessionTarget} area sessions`}><div className="grid grid-cols-2 gap-3">{model.options.areas.map((area)=><Field defaultValue={model.frequencies[area]} key={area} label={label(area)} max="7" min="0" name={`frequency_${area}`} step="1" type="number"/>)}</div></Section>
    <Section title="Prioritized muscle groups"><div className="grid grid-cols-2 gap-2">{model.options.areas.map((area)=><label className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--surface-muted)] px-3" key={area}><input defaultChecked={model.priorities.includes(area)} name="priorities" type="checkbox" value={area}/><span className="text-xs font-bold">{label(area)}</span></label>)}</div></Section>
    <Section title="Strategy approach"><Select defaultValue={model.progression} label="Progression" name="progression" options={model.options.progression}/></Section>
  </div>;
}

function strategyHelper(strategyType) {
  if (strategyType === "briefings") {
    return "Choose when PI checks in with you and when event-based reviews are created.";
  }
  if (strategyType === "nutrition") {
    return "Update the macro strategy supporting your current goal.";
  }
  return "Update the training strategy supporting your current goal.";
}

function TimeSelect({ defaultValue, label: selectLabel, name }) { const options=timeOptions(defaultValue);return <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--text-secondary)]">{selectLabel}</span><select className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3 text-sm font-semibold" defaultValue={defaultValue} name={name}>{options.map((option)=><option key={option} value={option}>{formatTime(option)}</option>)}</select></label>; }
function timeOptions(current){const values=Array.from({length:96},(_,index)=>`${String(Math.floor(index/4)).padStart(2,"0")}:${String((index%4)*15).padStart(2,"0")}`);if(current&&!values.includes(current))values.push(current);return values.sort();}
function formatTime(value){const[hour,minute]=value.split(":").map(Number);return new Date(2000,0,1,hour,minute).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});}
function Section({ children, title }) { return <section className="space-y-3 rounded-2xl bg-[var(--surface-elevated)] p-4"><h2 className="font-extrabold text-[var(--text-primary)]">{title}</h2>{children}</section>; }
function Field({ label: fieldLabel, ...props }) { return <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--text-secondary)]">{fieldLabel}</span><input className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3 text-sm font-semibold" {...props}/></label>; }
function Checkbox({ label: checkboxLabel, ...props }) { return <label className="flex min-h-12 items-center gap-3"><input type="checkbox" {...props}/><span className="text-sm font-bold">{checkboxLabel}</span></label>; }
function Select({ defaultValue, label: selectLabel, name, options }) { return <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--text-secondary)]">{selectLabel}</span><select className="min-h-12 w-full rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3 text-sm font-semibold" defaultValue={defaultValue} name={name}>{options.map((option)=><option key={option} value={option}>{label(option)}</option>)}</select></label>; }
function SubmitButton(){const{pending}=useFormStatus();return <button className="min-h-12 w-full rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white disabled:opacity-60" disabled={pending} type="submit">{pending?"Saving…":"Save Strategy"}</button>;}
function label(value){if(value==="weekly_interval_2")return "Every 2 weeks";return String(value).replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());}
