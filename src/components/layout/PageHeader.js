export default function PageHeader() {
  return (
    <div className="px-4 pt-8 pb-6">
      <p className="text-sm text-zinc-400">
        Good Morning 👋
      </p>

      <h1 className="mt-2 text-4xl font-bold">
        Dustin
      </h1>

      <p className="mt-4 text-zinc-400">
        You're on pace to reach your goal in
        <span className="font-semibold text-white"> 18 days</span>.
      </p>
    </div>
  );
}