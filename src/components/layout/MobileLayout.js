export default function MobileLayout({ children }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto w-full max-w-7xl">
        {children}
      </div>
    </div>
  );
}