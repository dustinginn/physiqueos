import BottomNav from "@/components/navigation/BottomNav";

export default function AppShell({ children }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">

      <div className="mx-auto max-w-md pb-28">

        {children}

      </div>

      <BottomNav />

    </main>
  );
}