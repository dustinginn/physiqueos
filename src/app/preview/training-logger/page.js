import TrainingLoggerPreview from "./TrainingLoggerPreview";

export const metadata = {
  title: "Training Logger Preview V1.3 | PhysiqueOS",
  description: "An isolated, interactive preview of the PhysiqueOS Training Logger.",
};

export default function TrainingLoggerPreviewPage() {
  return <TrainingLoggerPreview initialDate={getCanonicalLocalDate()} />;
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
