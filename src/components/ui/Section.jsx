export default function Section({
  eyebrow,
  title,
  action,
  children,
}) {
  return (
    <section className="space-y-5">

      <div className="flex items-end justify-between">

        <div>

          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {eyebrow}
            </p>
          )}

          {title && (
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {title}
            </h2>
          )}

        </div>

        {action}

      </div>

      {children}

    </section>
  );
}