export function readSupplementFormValues(formData, fields = ["name", "purpose", "role", "goalId", "startDate", "initialStatus"]) {
  return Object.fromEntries(fields.map((key) => [key, String(formData.get(key) ?? "").trim()]));
}

export function buildSupplementProvenance(user, reason, source) {
  return {
    author: { type: "user", id: user.id, displayName: user.name ?? user.displayName ?? "Founder" },
    reason,
    confirmation: { confirmedByUser: true, authority: "founder_direct_supplement_management" },
    source: { type: "manual", name: user.name ?? user.displayName ?? "Founder" },
    fieldProvenance: { source: "manual" },
    details: { source },
  };
}

export function supplementManagementMessage(outcome) {
  if (outcome === "duplicate") return "This supplement is already in your plan.";
  if (outcome === "version_conflict") return "This supplement changed while you were editing it. Review the latest version and try again.";
  if (outcome === "no_changes") return "No changes to save.";
  if (outcome === "invalid") return "Review the strategy fields and try again.";
  return "We could not update this supplement. Nothing was changed.";
}
