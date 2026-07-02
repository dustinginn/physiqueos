export default function Hero({ name = "Dustin" }) {
  return (
    <header className="flex items-start justify-between">
      <div>
        <p
          className="
            text-[14px]
            font-medium
            leading-none
            tracking-[-0.02em]
            text-slate-500
          "
        >
          Good morning,
        </p>

        <h1
          className="
            mt-[2px]
            text-[36px]
            font-semibold
            leading-[0.95]
            tracking-[-0.055em]
            text-[#0B1020]
          "
        >
          {name}
          <span className="text-[#4F46E5]">.</span>
        </h1>
      </div>

      <div
        className="
          h-14
          w-14
          overflow-hidden
          rounded-full
          bg-slate-200
          shadow-[0_8px_20px_rgba(15,23,42,.08)]
        "
      >
        <img
          src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
    </header>
  );
}