export default function SectionTitle({
  title,
  action,
  className = "",
}) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--primary)]">
        {title}
      </h2>

      {action}
    </div>
  );
}
