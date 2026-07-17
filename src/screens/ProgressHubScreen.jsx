import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import EvidenceHubIndex from "../components/progress/EvidenceHubIndex";

export default function ProgressHubScreen({ from, report }) {
  const fromYou = from === "you";

  return (
    <main className="app-surface min-h-screen overflow-x-hidden">
      <div className="mx-auto max-w-[393px] px-4 pb-32 pt-10">
        <Link
          className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-500"
          href={fromYou ? "/profile" : "/"}
        >
          <ArrowLeft size={18} />
          {fromYou ? "You" : "Home"}
        </Link>

        <header className="mb-5">
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
            {report.title}
          </h1>
        </header>

        <EvidenceHubIndex from={from} streams={report.streams} />
      </div>
    </main>
  );
}
