import AppShell from "../components/layout/AppShell";
import Dashboard from "../features/dashboard/Dashboard";

export default function Home() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}