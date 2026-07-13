import ProgressRing from "./ProgressRing";

export default function ConfidenceRing({
  className = "",
  label = "Confidence",
  size = 98,
  value = 0,
}) {
  return (
    <ProgressRing
      className={className}
      color="var(--confidence)"
      label={label}
      size={size}
      strokeWidth={6}
      value={value}
      animate
    />
  );
}
