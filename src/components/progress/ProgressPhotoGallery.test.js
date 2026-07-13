import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source=fs.readFileSync(new URL("./ProgressPhotoGallery.jsx",import.meta.url),"utf8");

describe("ProgressPhotoGallery production contract",()=>{
  it("renders only the Evidence Review sections",()=>{
    expect(source).toContain("Interpretation");expect(source).toContain("Capture Conditions");expect(source).toContain("Source History");
    for(const removed of ["Why it matters","Timeline Placement","Confidence Impact","Biggest Improvements","Remaining Focus","Persisted Comparison Findings","GallerySection","TagList"])expect(source).not.toContain(removed);
  });
  it("keeps mobile layout and pose-scoped navigation",()=>{
    expect(source).toContain("max-h-[92vh]");expect(source).toContain("selectedSessionRecords");expect(source).toContain("Previous");expect(source).toContain("Next");
  });
  it("makes dates dominant and keeps source history collapsed",()=>{
    expect(source).toContain("block text-xs font-extrabold");
    expect(source).toContain("<details className=");
    expect(source).not.toContain("{label} · {formatGalleryDate(date)}");
  });
});
