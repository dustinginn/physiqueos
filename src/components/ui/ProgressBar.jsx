export default function ProgressBar({
  value = 0,
  progress,
  color = "#3BC35B",
  className = "",
  label = "Progress",
}) {
  const currentValue = progress ?? value;
  const normalized = Math.min(Math.max(currentValue, 0), 100);

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={normalized}
      className={`
        h-2
        overflow-hidden
        rounded-full
        bg-[#E5E7EB]
        ${className}
      `}
      role="progressbar"
    >
      <div
        className="h-full rounded-full transition-all duration-200 ease-out"
        style={{
          width: `${normalized}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}
