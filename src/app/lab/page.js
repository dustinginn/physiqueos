import { readFile } from "node:fs/promises";
import path from "node:path";
import FounderAlphaLabScreen from "../../screens/FounderAlphaLabScreen";
import { parsePersonasFromMarkdown } from "../../domain/lab/personaParser";

export const metadata = {
  title: "Founder Alpha Lab | PhysiqueOS",
};

export default async function FounderAlphaLabPage() {
  const markdown = await readFile(
    path.join(process.cwd(), "docs", "PERSONAS.md"),
    "utf8"
  );
  const personas = parsePersonasFromMarkdown(markdown);

  return <FounderAlphaLabScreen personas={personas} />;
}
