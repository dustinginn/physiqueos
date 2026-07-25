import EvidenceExperiencePreview from "./EvidenceExperiencePreview";

export const metadata = {
  title: "Evidence Experience Preview | PhysiqueOS",
};

export default function EvidenceExperiencePreviewPage() {
  return <EvidenceExperiencePreview initialDate={getCanonicalLocalDate()} />;
}

function getCanonicalLocalDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Los_Angeles",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
