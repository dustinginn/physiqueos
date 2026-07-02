const fs = require("fs");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch");

const img1 = PNG.sync.read(fs.readFileSync("public/mockup-home.png"));
const img2 = PNG.sync.read(fs.readFileSync("screenshots/home.png"));

const { width, height } = img1;

if (img2.width !== width || img2.height !== height) {
  throw new Error(
    `Image sizes differ.
Mockup: ${width}x${height}
Screenshot: ${img2.width}x${img2.height}`
  );
}

const diff = new PNG({
  width,
  height,
});

const mismatchedPixels = pixelmatch(
  img1.data,
  img2.data,
  diff.data,
  width,
  height,
  {
    threshold: 0.12,
  }
);

if (!fs.existsSync("screenshots")) {
  fs.mkdirSync("screenshots");
}

fs.writeFileSync(
  "screenshots/diff.png",
  PNG.sync.write(diff)
);

console.log("");
console.log("✅ Diff generated!");
console.log(`Pixels different: ${mismatchedPixels}`);
console.log("Saved to screenshots/diff.png");