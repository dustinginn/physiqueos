export default function Sidebar() {
  const menuItems = [
    "Dashboard",
    "Timeline",
    "Body Composition",
    "Nutrition",
    "Goals",
    "AI Insights",
    "Settings",
  ];

  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-900 p-6">
      <h1 className="mb-10 text-2xl font-bold text-white">
        PhysiqueOS
      </h1>

      <nav className="space-y-2">
        {menuItems.map((item) => (
          <button
            key={item}
            className="w-full rounded-lg px-4 py-3 text-left text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
          >
            {item}
          </button>
        ))}
      </nav>
    </aside>
  );
}