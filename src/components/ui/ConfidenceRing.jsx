import ProgressRing from "./ProgressRing";

export default function ConfidenceRing({
  animate = true,
  className = "",
  label = "Confidence",
  size = 98,
  showLabel = true,
  value = 0,
}) {
  return (
    <ProgressRing
      className={className}
      color="var(--confidence)"
      label={label}
      size={size}
      showLabel={showLabel}
      strokeWidth={6}
      value={value}
      animate={animate}
    />
  );
}
