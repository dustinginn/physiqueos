export default function HomeMissionCard({
  title,
  description,
  action,
  onClick,
}) {
  return (
    <div className="rounded-3xl bg-zinc-900 p-6">

      <p className="text-xs uppercase tracking-widest text-zinc-500">
        Today&apos;s Mission
      </p>

      <h2 className="mt-3 text-2xl font-bold">
        {title}
      </h2>

      <p className="mt-3 text-zinc-400">
        {description}
      </p>

      <button
        onClick={onClick}
        className="mt-6 w-full rounded-2xl bg-white py-4 font-semibold text-black transition hover:opacity-90"
      >
        {action}
      </button>

    </div>
  );
}
