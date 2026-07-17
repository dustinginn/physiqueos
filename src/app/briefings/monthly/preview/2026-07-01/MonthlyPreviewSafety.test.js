import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
const source=fs.readFileSync(new URL("./page.js",import.meta.url),"utf8");

const preview = { hero: { title: "June turned momentum into confidence." } };
const previewFn = vi.fn(async () => preview);
const MonthlyScreen = vi.fn(() => null);

vi.mock("../../../../../data/repositories/founderRepositories", () => ({ FounderRepositories: { users: { getCurrentUser: async () => ({ id: "founder" }) } } }));
vi.mock("../../../../../domain/services/MonthlyBriefingPreviewService", () => ({ createMonthlyBriefingPreviewService: () => ({ preview: previewFn }) }));
vi.mock("../../../../../screens/MonthlyBriefingScreen", () => ({ default: MonthlyScreen }));

describe("Monthly preview safety",()=>{
  it("uses the preview-only service and never generates or persists",()=>{expect(source).toContain("createMonthlyBriefingPreviewService");expect(source).toContain(".preview(");expect(source).not.toMatch(/\.generate\(|createDailyBriefing|persist/);});
  it("resolves the exact route module and renders the Monthly screen with the June title",async()=>{const {default:Page}=await import("./page");const element=await Page();expect(element.type).toBe(MonthlyScreen);expect(element.props.narrative.hero.title).toBe("June turned momentum into confidence.");expect(previewFn).toHaveBeenCalledWith({userId:"founder"});});
});
