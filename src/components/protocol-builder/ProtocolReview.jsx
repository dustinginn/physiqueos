export default function ProtocolReview({ footer, sections = [] }) {
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <section className="rounded-[16px] bg-[var(--surface-muted)] p-4" key={section.label}>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            {section.label}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm font-extrabold leading-6 text-[var(--text-primary)]">
            {section.value}
          </p>
        </section>
      ))}
      {footer && (
        <p className="pt-1 text-center text-xs font-bold text-[var(--text-muted)]">
          {footer}
        </p>
      )}
    </div>
  );
}
