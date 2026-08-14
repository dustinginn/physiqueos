import { destinationToWebHref, isDestinationId } from "../../contracts/v1/destination.js";

// The pre-authentication web surface still renders legacy component props. Keep the
// application read model typed internally, then restore href only at that presentation edge.
export function adaptApplicationReadModelToLegacyWeb(value) {
  if (Array.isArray(value)) return value.map(adaptApplicationReadModelToLegacyWeb);
  if (!value || typeof value !== "object") return value;

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "destination" && isDestinationId(child?.id)) {
      output.href = destinationToWebHref(child);
      continue;
    }
    output[key] = adaptApplicationReadModelToLegacyWeb(child);
  }
  return output;
}
