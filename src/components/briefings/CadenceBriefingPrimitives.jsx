import Card from "../ui/Card";
import IconBadge from "../ui/IconBadge";

export function CadenceBriefingHero({
  icon: Icon,
  label,
  labelDetail = null,
  confidence = null,
  meta = null,
  title,
  body,
  context = null,
  children = null,
  testId,
}) {
  return <section
    className="rounded-[28px] border border-[color-mix(in_srgb,var(--chart-2)_20%,var(--divider))] bg-gradient-to-br from-[color-mix(in_srgb,var(--chart-2)_8%,var(--surface-elevated))] to-[var(--surface-elevated)] p-5 shadow-[var(--shadow-card)]"
    data-testid={testId}
  >
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2"><IconBadge color="evidence" icon={Icon}/><div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--chart-2)]">{label}</p>{labelDetail}</div></div>
      {meta}
    </div>
    {confidence}
    {context}
    <h1 className="mt-1 text-[28px] font-black leading-[1.12] text-[var(--text-primary)]" data-testid={testId ? `${testId}-headline` : undefined}>{title}</h1>
    <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]" data-testid={testId ? `${testId}-body` : undefined}>{body}</p>
    {children}
  </section>;
}

export function BriefingFeatureCard({ icon, label, tone = "primary", title, children, testId }) {
  return <Card>
    <div data-testid={testId}>
      <BriefingSectionHeading icon={icon} tone={tone}>{label}</BriefingSectionHeading>
      <h2 className="mt-2 text-xl font-black leading-6">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  </Card>;
}

export function BriefingSectionHeading({ icon: Icon, children, tone = "primary" }) {
  return <div className="flex items-center gap-2">
    {Icon && <IconBadge color={tone} icon={Icon} size="xs"/>}
    <p className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--primary)]">{children}</p>
  </div>;
}
