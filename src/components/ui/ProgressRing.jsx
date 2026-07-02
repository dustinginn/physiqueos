export default function ProgressRing({
  value = 94,
  label = "Confidence",
  size = 128,
  strokeWidth = 8,
  color = "var(--confidence)",
  trackColor = "var(--confidence-track)",
  className = "",
}) {
  const normalized = Math.min(Math.max(value, 0), 100);
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;
  const valueFontSize = Math.max(22, Math.round(size * 0.25));
  const labelFontSize = Math.max(8, Math.round(size * 0.07));

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ height: size, width: size }}
      aria-label={`${label} confidence: ${normalized}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={normalized}
      role="progressbar"
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />

        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="font-bold leading-none text-[var(--text-primary)]"
          style={{ fontSize: valueFontSize }}
        >
          {normalized}%
        </div>

        <div
          className="mt-1 max-w-[82%] text-center font-bold uppercase leading-[1.05] tracking-[0.035em] text-[var(--text-muted)]"
          style={{ fontSize: labelFontSize }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
