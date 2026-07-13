import fs from "node:fs";
import {describe,expect,it} from "vitest";
const source=fs.readFileSync(new URL("./PhotoEventBriefingScreen.jsx",import.meta.url),"utf8");
describe("PhotoEventBriefingScreen V2",()=>{
  it("uses standard briefing hierarchy instead of a black report hero",()=>{expect(source).toContain("IconBadge");expect(source).toContain("Photo Event");expect(source).not.toContain("bg-slate-950 p-5");});
  it("opens an in-place touch viewer without Gallery navigation",()=>{expect(source).toContain("setViewerIndex");expect(source).toContain('role="dialog"');expect(source).toContain("onTouchStart");expect(source).toContain("onTouchEnd");expect(source).toContain("[touch-action:pinch-zoom]");expect(source).not.toContain("Open in Gallery");expect(source).not.toContain("?session=");});
  it("restores scroll position and cycles canonical narrative views",()=>{expect(source).toContain("scrollPosition.current=window.scrollY");expect(source).toContain("window.scrollTo");expect(source).toContain("views.length");});
  it("locks background scroll for the lifetime of the viewer",()=>{expect(source).toContain('body.style.position="fixed"');expect(source).toContain('body.style.overflow="hidden"');expect(source).toContain("overscroll-none");expect(source).toContain("overscroll-contain");});
  it("tracks drag distance and velocity, then completes or springs back",()=>{expect(source).toContain("setDragOffset(offset)");expect(source).toContain("const velocity=delta/elapsed");expect(source).toContain("window.innerWidth*.22");expect(source).toContain("transition-transform duration-300 ease-out");});
  it("gates paging during zoom and preloads adjacent poses",()=>{expect(source).toContain("setZooming(true)");expect(source).toContain("if(zooming)");expect(source).toContain("const preload=new Image()");expect(source).toContain("preload.src=src");});
  it("keeps a compact responsive hierarchy",()=>{expect(source).toContain("max-w-[560px]");expect(source).toContain("space-y-3");expect(source).toContain("grid-cols-3");});
});
