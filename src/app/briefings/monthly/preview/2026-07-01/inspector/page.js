import { redirect } from "next/navigation";

export default async function MonthlyBriefingPreviewInspectorRedirect({ searchParams }) {
  const resolved = await searchParams;
  const fixture = resolved?.fixture;
  const query = fixture ? `?fixture=${encodeURIComponent(fixture)}` : "";
  redirect(`/briefings/monthly/preview/2026-07-01/inspect${query}`);
}
