import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/package.json');
const sharp = require('sharp');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const input = path.join(root, 'media', 'founder-back-relaxed-current.png');

// Pixel-only extraction from the authenticated app-rendered asset. No filters,
// retouching, relabeling, or synthetic media are applied.
await sharp(input)
  .extract({ left: 0, top: 448, width: 164, height: 127 })
  .png()
  .toFile(path.join(root, 'media', 'founder-back-relaxed-prior-detail.png'));

await sharp(input)
  .extract({ left: 0, top: 0, width: 330, height: 405 })
  .png()
  .toFile(path.join(root, 'media', 'founder-back-relaxed-current-detail.png'));

