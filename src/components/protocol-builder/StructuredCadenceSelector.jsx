export default function StructuredCadenceSelector({
  frequencyLabel,
  frequencyOptions,
  recommendedFrequency,
  selection,
  setSelection,
  weekdayOptions = [],
  daypartOptions = [],
}) {
  return (
    <div className="space-y-4">
      <ChoiceSet
        label={frequencyLabel}
        options={frequencyOptions}
        recommended={recommendedFrequency}
        set={(frequency) => setSelection({ ...selection, frequency })}
        value={selection.frequency}
      />
      {weekdayOptions.length > 0 && (
        <ChoiceSet
          label="Which day works best?"
          options={weekdayOptions}
          set={(dayOfWeek) => setSelection({ ...selection, dayOfWeek })}
          value={selection.dayOfWeek}
        />
      )}
      {daypartOptions.length > 0 && (
        <ChoiceSet
          label="When?"
          options={daypartOptions}
          set={(daypart) => setSelection({ ...selection, daypart })}
          value={selection.daypart}
        />
      )}
    </div>
  );
}

function ChoiceSet({ label, options, recommended, set, value }) {
  return (
    <div>
      <p className="mb-2 text-sm font-extrabold text-[var(--text-primary)]">{label}</p>
      <div className="space-y-2">
        {options.map((option) => (
          <button
            aria-pressed={value === option.id}
            className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm font-extrabold ${
              value === option.id
                ? "border-[var(--primary)] bg-[var(--surface-accent)] text-[var(--primary)]"
                : "border-[var(--divider)] text-[var(--text-primary)]"
            }`}
            key={option.id}
            onClick={() => set(option.id)}
            type="button"
          >
            <span>{option.label}</span>
            {recommended === option.id && (
              <span className="text-[10px] uppercase tracking-[.06em] text-[var(--text-muted)]">Recommended</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
