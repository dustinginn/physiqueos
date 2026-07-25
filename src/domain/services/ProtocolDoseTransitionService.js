export function resolveProtocolDoseTransition(protocol, occurrenceDate) {
  const steps = [...(protocol?.doseHistory ?? [])].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );
  const index = steps.findLastIndex(
    (step) =>
      step.startDate <= occurrenceDate &&
      (!step.endDate || step.endDate >= occurrenceDate)
  );
  const effective = index >= 0 ? steps[index] : null;
  const previous = index > 0 ? steps[index - 1] : null;
  const next = index >= 0 ? steps.slice(index + 1).find((step) => step.startDate > occurrenceDate) : null;

  return {
    effectiveDose: effective ? { value: effective.dose, unit: effective.doseUnit } : protocol?.dose ?? null,
    previousDose: previous ? { value: previous.dose, unit: previous.doseUnit } : null,
    effectiveDate: effective?.startDate ?? null,
    nextDose: next ? { value: next.dose, unit: next.doseUnit } : null,
    nextEffectiveDate: next?.startDate ?? null,
    changeEffectiveToday: effective?.startDate === occurrenceDate,
    taperStepId: effective?.label ?? null,
  };
}
