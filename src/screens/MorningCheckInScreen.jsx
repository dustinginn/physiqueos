import Link from "next/link";
import { ArrowLeft, ClipboardList, Flame, Scale } from "lucide-react";
import Card from "../components/ui/Card";
import ActionButton from "../components/ui/ActionButton";
import IconBadge from "../components/ui/IconBadge";

export default function MorningCheckInScreen({
  action,
  reconciliationItems = [],
  returnTo = null,
}) {
  return (
    <main className="min-h-screen bg-[#F7F8FA]">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-10">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href="/"
        >
          <ArrowLeft size={18} />
          Home
        </Link>

        <div className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
            Morning Check-In
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
            Log morning evidence
          </h1>
          <p className="text-base leading-7 text-slate-500">
            Start with your manual morning weight. PhysiqueOS will treat it as
            today&apos;s morning weight evidence.
          </p>
        </div>

        <form action={action} className="space-y-4">
          {returnTo && <input name="returnTo" type="hidden" value={returnTo} />}
          {reconciliationItems.length > 0 && (
            <Card className="space-y-4">
              <FieldLabel icon={ClipboardList} label="Yesterday" />
              <p className="text-sm font-medium leading-6 text-slate-500">
                Quick catch-up for recurring priorities that were not confirmed.
              </p>
              <div className="space-y-3">
                {reconciliationItems.map((item) => (
                  <div
                    className="rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-3"
                    key={item.id}
                  >
                    <p className="text-sm font-bold text-slate-950">
                      Did you complete {item.dateLabel}&apos;s {item.title}?
                    </p>
                    <input
                      name="reconciliationIds"
                      type="hidden"
                      value={item.id}
                    />
                    <input
                      name={`${item.id}_date`}
                      type="hidden"
                      value={item.date}
                    />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <ReconciliationOption
                        label="Yes"
                        name={`${item.id}_status`}
                        value="completed"
                      />
                      <ReconciliationOption
                        label="Skipped"
                        name={`${item.id}_status`}
                        value="skipped"
                      />
                      <ReconciliationOption
                        label="Note"
                        name={`${item.id}_status`}
                        value="note"
                      />
                    </div>
                    <textarea
                      className="mt-3 min-h-16 w-full resize-none rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                      name={`${item.id}_note`}
                      placeholder="Optional note"
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="space-y-5">
            <FieldLabel
              icon={Scale}
              label="Morning weight"
              required
            />
            <div className="flex items-end gap-3">
              <input
                className="min-h-16 w-full rounded-[16px] border border-[#E5E7EB] bg-white px-4 text-3xl font-bold text-slate-950 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                inputMode="decimal"
                min="1"
                name="weight"
                placeholder="171.8"
                required
                step="0.1"
                type="number"
              />
              <span className="pb-4 text-lg font-semibold text-slate-500">lb</span>
            </div>
          </Card>

          <details className="rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
            <summary className="cursor-pointer text-sm font-bold text-slate-700">
              Different conditions?
            </summary>

            <div className="mt-4 space-y-4">
              <label className="flex items-start gap-3 rounded-[14px] bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                <input
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  name="contextOverride"
                  type="checkbox"
                />
                <span>
                  Add context for an unusual weigh-in
                  <span className="block text-xs font-medium leading-5 text-slate-500">
                    Default is morning, fasted, before food/water, normal home scale.
                  </span>
                </span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <ContextSelect label="Timing" name="weighInTiming">
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                </ContextSelect>
                <ContextSelect label="Scale" name="scaleContext">
                  <option value="normal_home_scale">Home scale</option>
                  <option value="different_scale">Different scale</option>
                </ContextSelect>
                <ContextSelect label="Food" name="nutritionState">
                  <option value="fasted">Fasted</option>
                  <option value="after_meal">After meal</option>
                </ContextSelect>
                <ContextSelect label="Intake" name="intakeState">
                  <option value="before_food_water">Before food/water</option>
                  <option value="after_food_water">After food/water</option>
                </ContextSelect>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <ContextCheckbox label="After workout" value="after_workout" />
                <ContextCheckbox label="Travel" value="travel" />
                <ContextCheckbox label="Unusual hydration" value="unusual_hydration" />
                <ContextCheckbox label="Different routine" value="different_routine" />
              </div>

              <textarea
                className="min-h-20 w-full resize-none rounded-[14px] border border-[#E5E7EB] bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                name="contextNotes"
                placeholder="Optional context notes"
              />
            </div>
          </details>

          <details className="rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
            <summary className="cursor-pointer text-sm font-bold text-slate-700">
              Add notes or nutrition?
            </summary>

            <div className="mt-4 space-y-4">
              <FieldLabel icon={ClipboardList} label="Notes" />
              <textarea
                className="min-h-24 w-full resize-none rounded-[16px] border border-[#E5E7EB] bg-white px-4 py-3 text-base leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                name="notes"
                placeholder="Sleep, soreness, travel, sodium, appetite..."
              />

              <FieldLabel icon={Flame} label="Estimated calories" />
              <input
                className="min-h-14 w-full rounded-[16px] border border-[#E5E7EB] bg-white px-4 text-lg font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                inputMode="numeric"
                min="0"
                name="estimatedCalories"
                placeholder="Estimated intake, optional"
                step="1"
                type="number"
              />
              <input
                className="min-h-14 w-full rounded-[16px] border border-[#E5E7EB] bg-white px-4 text-lg font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                inputMode="numeric"
                min="0"
                name="estimatedCaloriesBurned"
                placeholder="Estimated burn, optional"
                step="1"
                type="number"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="min-h-14 w-full rounded-[16px] border border-[#E5E7EB] bg-white px-4 text-base font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  inputMode="numeric"
                  min="0"
                  name="proteinTarget"
                  placeholder="Protein target"
                  step="1"
                  type="number"
                />
                <input
                  className="min-h-14 w-full rounded-[16px] border border-[#E5E7EB] bg-white px-4 text-base font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  inputMode="numeric"
                  min="0"
                  name="proteinAchieved"
                  placeholder="Protein hit"
                  step="1"
                  type="number"
                />
              </div>
            </div>
          </details>

          <details className="rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
            <summary className="cursor-pointer text-sm font-bold text-slate-700">
              Protocol changes?
            </summary>
            <textarea
              className="mt-4 min-h-24 w-full resize-none rounded-[16px] border border-[#E5E7EB] bg-slate-50 px-4 py-3 text-base leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              name="protocolChanges"
              placeholder="Optional placeholder for future protocol updates"
            />
          </details>

          <ActionButton type="submit">Save Evidence</ActionButton>
        </form>
      </div>
    </main>
  );
}

function ReconciliationOption({ label, name, value }) {
  return (
    <label className="flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#E5E7EB] bg-white px-2 text-xs font-bold text-slate-700">
      <input
        className="h-3.5 w-3.5 border-slate-300 text-indigo-600 focus:ring-indigo-500"
        name={name}
        type="radio"
        value={value}
      />
      <span>{label}</span>
    </label>
  );
}

function ContextSelect({ label, name, children }) {
  return (
    <label className="space-y-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
      <span>{label}</span>
      <select
        className="min-h-11 w-full rounded-[12px] border border-[#E5E7EB] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        name={name}
      >
        {children}
      </select>
    </label>
  );
}

function ContextCheckbox({ label, value }) {
  return (
    <label className="flex min-h-10 items-center gap-2 rounded-[12px] border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-slate-700">
      <input
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        name="conditions"
        type="checkbox"
        value={value}
      />
      <span>{label}</span>
    </label>
  );
}

function FieldLabel({ icon, label, required = false }) {
  return (
    <div className="flex items-center gap-3">
      <IconBadge icon={icon} color="primary" size="sm" />
      <div>
        <p className="text-base font-bold text-slate-950">{label}</p>
        {required && (
          <p className="text-sm font-medium text-slate-500">
            Required manual evidence
          </p>
        )}
      </div>
    </div>
  );
}
