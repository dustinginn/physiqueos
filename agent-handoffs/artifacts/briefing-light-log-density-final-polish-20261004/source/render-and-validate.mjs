import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const previousRoot = path.resolve(root, '../weekly-midweek-light-translation-final-20261004');
const selectedLogRoot = path.resolve(root, '../selected-home-log-exploration-20261004');
const screens = path.join(root, 'screens');
await fs.mkdir(screens, { recursive: true });

const weeklyFixtures = JSON.parse(await fs.readFile(path.join(root, 'WEEKLY-NATIVE-FIXTURES.json'), 'utf8'));
const midweek = JSON.parse(await fs.readFile(path.join(root, 'MIDWEEK-NATIVE-FIXTURE.json'), 'utf8'));
const logFixture = JSON.parse(await fs.readFile(path.join(root, 'LOG-DENSE-FIXTURE.json'), 'utf8'));
const previousValidation = JSON.parse(await fs.readFile(path.join(previousRoot, 'validation.json'), 'utf8'));
const expectedSemantics = {
  weekly: previousValidation.renders['weekly-light'].semantic,
  midweek: previousValidation.renders['midweek-light'].semantic,
};
const expectedSections = {
  weekly: previousValidation.requiredOrder.weekly,
  midweek: previousValidation.requiredOrder.midweek,
};

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 3 });
await page.addInitScript(({ weeklyFixtures, midweek }) => {
  globalThis.__WEEKLY_FIXTURES__ = weeklyFixtures;
  globalThis.__MIDWEEK_FIXTURE__ = midweek;
}, { weeklyFixtures, midweek });
await page.goto(`file://${path.join(root, 'briefing-light-polish.html')}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
await page.evaluate(() => document.fonts.ready);

async function inspectBriefing(cadence) {
  return page.locator(`.phone[data-variant="${cadence}-light"]`).evaluate((el, args) => {
    const actual = Object.fromEntries([...el.querySelectorAll('[data-semantic]')].map(node => [node.dataset.semantic, node.dataset.value ?? '']));
    const missing = Object.keys(args.expected).filter(key => !(key in actual));
    const mismatches = Object.keys(args.expected).filter(key => key in actual && args.expected[key] !== actual[key]).map(key => ({ key, expected: args.expected[key], actual: actual[key] }));
    const extra = Object.keys(actual).filter(key => !(key in args.expected));
    const sections = [...el.querySelectorAll('[data-section]')].map(node => node.dataset.section);
    const energy = el.querySelector(`[data-chart="${args.cadence}-energy"]`);
    const energyMarks = [...energy.querySelectorAll('[data-series]')].map(node => ({ series: node.dataset.series, value: Number(node.dataset.value), sourceKey: node.dataset.sourceKey }));
    const recovery = el.querySelector(`[data-section="${args.cadence}-recovery"]`);
    const rect = el.getBoundingClientRect();
    const surfaceSelectors = ['energy','weight','body-composition','training','recovery','finale'];
    const surfaces = Object.fromEntries(surfaceSelectors.map(name => {
      const node = el.querySelector(`[data-section="${args.cadence}-${name}"]`);
      return [name, { background: getComputedStyle(node).background, borderRadius: getComputedStyle(node).borderRadius }];
    }));
    const priority = args.cadence === 'weekly' ? el.querySelector('[data-block="weekly-priority-muscle-groups"]') : null;
    const priorityContent = priority ? [...priority.querySelectorAll('.priority')].map(node => ({
      label: node.querySelector('strong')?.innerText,
      status: node.querySelector('.priority-status')?.innerText,
      count: node.querySelector('.priority-count')?.innerText,
    })) : [];
    const essentialSizes = [...el.querySelectorAll('.body-copy,.meaning,.weight-note,.priority strong,.priority-status,.priority-count,.coach-block p')].map(node => Number.parseFloat(getComputedStyle(node).fontSize));
    return {
      cadence: args.cadence,
      widthPoints: Math.round(rect.width),
      heightPoints: Math.round(rect.height),
      semantic: actual,
      missing,
      mismatches,
      extra,
      sections,
      innerText: el.innerText,
      energy: { pointCount: Number(energy.dataset.pointCount), marks: energyMarks, label: energy.getAttribute('aria-label') },
      recovery: {
        points: [...recovery.querySelectorAll('.sleep-point')].map(node => Number(node.dataset.value)),
        label: recovery.querySelector('svg').getAttribute('aria-label'),
        fixtureOnly: recovery.dataset.fixtureOnly,
        confidenceCoupling: recovery.dataset.confidenceCoupling,
        status: recovery.querySelector('.status-pill').innerText.trim(),
      },
      surfaces,
      priorityContent,
      priorityGridColumns: priority ? getComputedStyle(priority).gridTemplateColumns : null,
      essentialSizes,
      photosAbsent: !el.innerText.includes('Photos'),
      unresolvedAbsent: !el.innerText.includes('Still Unresolved'),
    };
  }, { cadence, expected: expectedSemantics[cadence] });
}

const briefingRenders = {
  weekly: await inspectBriefing('weekly'),
  midweek: await inspectBriefing('midweek'),
};
for (const [cadence, result] of Object.entries(briefingRenders)) {
  result.sectionOrderExact = JSON.stringify(result.sections) === JSON.stringify(expectedSections[cadence]);
  result.energyExact = JSON.stringify(result.energy) === JSON.stringify(previousValidation.renders[`${cadence}-light`].energy);
  result.recoveryExact = JSON.stringify(result.recovery) === JSON.stringify(previousValidation.renders[`${cadence}-light`].recovery);
  result.surfaceRhythmPass = result.surfaces.energy.background !== result.surfaces.weight.background
    && result.surfaces.training.background !== result.surfaces.weight.background
    && result.surfaces.recovery.background !== result.surfaces.weight.background
    && result.surfaces.finale.background !== result.surfaces.weight.background;
  result.accessibilityPass = result.essentialSizes.every(size => size >= 11) && result.recovery.label.length > 40;
  result.pass = result.widthPoints === 402 && result.missing.length === 0 && result.mismatches.length === 0 && result.extra.length === 0
    && result.sectionOrderExact && result.energyExact && result.recoveryExact && result.surfaceRhythmPass && result.accessibilityPass
    && result.photosAbsent && result.unresolvedAbsent;
  if (!result.pass) throw new Error(`${cadence} briefing validation failed:\n${JSON.stringify(result, null, 2)}`);
}

const expectedPriority = weeklyFixtures.find(item => item.id === 'weekly_briefing_2026-08-23_2026-08-29').weekly.training.priorityGroups
  .map(item => ({ label: item.label, status: item.statusLabel, count: `${item.comparableExerciseCount} exercises` }));
if (JSON.stringify(briefingRenders.weekly.priorityContent) !== JSON.stringify(expectedPriority)) {
  throw new Error(`Priority content mismatch: ${JSON.stringify(briefingRenders.weekly.priorityContent)}`);
}

const previousPage = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 3 });
await previousPage.addInitScript(({ weeklyFixtures, midweek }) => {
  globalThis.__WEEKLY_FIXTURES__ = weeklyFixtures;
  globalThis.__MIDWEEK_FIXTURE__ = midweek;
}, { weeklyFixtures, midweek });
await previousPage.goto(`file://${path.join(previousRoot, 'family-final.html')}`, { waitUntil: 'networkidle' });
await previousPage.waitForFunction(() => document.documentElement.dataset.ready === 'true');
await previousPage.evaluate(() => document.fonts.ready);

async function priorityRange(targetPage, phoneSelector) {
  return targetPage.locator(phoneSelector).evaluate(el => {
    const label = [...el.querySelectorAll('.sub-label')].find(node => node.innerText.includes('Priority Muscle Groups'));
    const list = label?.nextElementSibling;
    const phone = el.getBoundingClientRect(), start = label.getBoundingClientRect(), end = list.getBoundingClientRect();
    return { top: Math.round(start.top - phone.top), bottom: Math.round(end.bottom - phone.top), height: Math.round(end.bottom - start.top) };
  });
}
const oldPriority = await priorityRange(previousPage, '.phone[data-variant="weekly-light"]');
const newPriority = await priorityRange(page, '.phone[data-variant="weekly-light"]');
const priorityCompaction = {
  oldHeightPoints: oldPriority.height,
  newHeightPoints: newPriority.height,
  reductionPoints: oldPriority.height - newPriority.height,
  reductionPercent: Math.round((oldPriority.height - newPriority.height) / oldPriority.height * 100),
  exactSemanticContent: true,
  twoColumnLeftAligned: briefingRenders.weekly.priorityGridColumns.split(' ').length === 2,
};
if (priorityCompaction.reductionPoints < 20 || !priorityCompaction.twoColumnLeftAligned) throw new Error(`Priority compaction insufficient: ${JSON.stringify(priorityCompaction)}`);

const briefingFull = {};
for (const cadence of ['weekly','midweek']) {
  const file = path.join(screens, `${cadence}-light-refined-full.png`);
  await page.locator(`.phone[data-variant="${cadence}-light"]`).screenshot({ path: file });
  briefingFull[cadence] = file;
  for (const focus of ['recovery','finale']) {
    await page.locator(`.phone[data-variant="${cadence}-light"] [data-section="${cadence}-${focus}"]`).screenshot({ path: path.join(screens, `${cadence}-${focus}-light-refined.png`) });
  }
}

async function cropRange(input, topPoints, bottomPoints, output) {
  const meta = await sharp(input).metadata();
  const top = Math.max(0, Math.round(topPoints * 3));
  const bottom = Math.min(meta.height, Math.round(bottomPoints * 3));
  await sharp(input).extract({ left: 0, top, width: meta.width, height: bottom - top }).png().toFile(output);
}
const previousWeeklyFull = path.join(root, 'screens/weekly-light-before.png');
await cropRange(previousWeeklyFull, oldPriority.top, oldPriority.bottom, path.join(screens, 'weekly-priority-muscle-groups-before.png'));
await cropRange(briefingFull.weekly, newPriority.top, newPriority.bottom, path.join(screens, 'weekly-priority-muscle-groups-after.png'));

const logPage = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 3 });
await logPage.addInitScript(logFixture => { globalThis.__LOG_DENSE_FIXTURE__ = logFixture; }, logFixture);
await logPage.goto(`file://${path.join(root, 'log-density.html')}`, { waitUntil: 'networkidle' });
await logPage.waitForFunction(() => document.documentElement.dataset.ready === 'true');
await logPage.evaluate(() => document.fonts.ready);

async function inspectLog(theme) {
  return logPage.locator(`.phone[data-variant="log-${theme}"]`).evaluate((el, theme) => {
    const semantics = Object.fromEntries([...el.querySelectorAll('[data-semantic]')].map(node => [node.dataset.semantic, node.dataset.value ?? '']));
    const rect = el.getBoundingClientRect();
    const sectionGeometry = [...el.querySelectorAll('[data-section]')].map(node => {
      const r = node.getBoundingClientRect();
      return { section: node.dataset.section, x: Math.round(r.x - rect.x), y: Math.round(r.y - rect.y), width: Math.round(r.width), height: Math.round(r.height) };
    });
    const tiles = [...el.querySelectorAll('.tile')];
    const targets = [...el.querySelectorAll('.training-action,.tile,.quick-action,.details,.tab')].map(node => ({ text: node.innerText.trim(), height: Math.round(node.getBoundingClientRect().height) }));
    return {
      theme,
      widthPoints: Math.round(rect.width),
      heightPoints: Math.round(rect.height),
      innerText: el.innerText,
      semantics,
      sectionGeometry,
      tileText: tiles.map(node => node.innerText),
      sourcesText: el.querySelector('.sources').innerText,
      sourceAria: el.querySelector('.sources').getAttribute('aria-label'),
      appleHealthInsideTiles: tiles.some(node => node.innerText.includes('Apple Health')),
      targets,
      visibleSizes: [...el.querySelectorAll('.tile *, .sources *, .review *, .quick-action, .details')].filter(node => getComputedStyle(node).display !== 'none').map(node => Number.parseFloat(getComputedStyle(node).fontSize)),
    };
  }, theme);
}
const logRenders = { dark: await inspectLog('dark'), light: await inspectLog('light') };
const normalizeGeometry = value => value.map(({ section, x, y, width, height }) => ({ section, x, y, width, height }));
const logParity = {
  contentExact: logRenders.dark.innerText === logRenders.light.innerText,
  semanticsExact: JSON.stringify(logRenders.dark.semantics) === JSON.stringify(logRenders.light.semantics),
  geometryExact: JSON.stringify(normalizeGeometry(logRenders.dark.sectionGeometry)) === JSON.stringify(normalizeGeometry(logRenders.light.sectionGeometry)),
  heightExact: logRenders.dark.heightPoints === logRenders.light.heightPoints,
};
logParity.pass = Object.values(logParity).every(Boolean);
const requiredLogText = [
  'Strength Training · 64 min', 'Stair Stepper · 13 min', '2,516 calories', '215P · 161C · 111F',
  '771 active calories so far', '176.7 lb', 'Uploads ready to review', 'Check-in ready to review',
  'Training Logger', 'Log weight for another date', 'Add evidence', 'Add details without an asset',
];
const logContentValidation = {
  allRequiredPresent: requiredLogText.every(value => logRenders.dark.innerText.toLowerCase().includes(value.toLowerCase())),
  cooldownAbsent: !logRenders.dark.innerText.includes('Cooldown'),
  appleHealthCentralized: !logRenders.dark.appleHealthInsideTiles && logRenders.dark.sourcesText.includes('Apple Health'),
  sourceMappingExact: logRenders.dark.sourcesText.includes('Stair Stepper · Nutrition · Activity')
    && logRenders.dark.sourcesText.includes('PhysiqueOS Logger')
    && logRenders.dark.sourcesText.includes('Strength Training')
    && logRenders.dark.sourcesText.includes('Weight')
    && logRenders.dark.sourcesText.includes('Source unavailable'),
  allTargetsAtLeast44: logRenders.dark.targets.every(target => target.height >= 44),
  noTinyType: logRenders.dark.visibleSizes.every(size => size >= 11) && logRenders.light.visibleSizes.every(size => size >= 11),
  sourceVoiceOverGroup: logRenders.dark.sourceAria === 'Evidence sources',
};
logContentValidation.pass = Object.values(logContentValidation).every(Boolean);
if (!logParity.pass || !logContentValidation.pass) throw new Error(`Log validation failed:\n${JSON.stringify({ logParity, logContentValidation, logRenders }, null, 2)}`);

const logFull = {};
for (const theme of ['dark','light']) {
  const full = path.join(screens, `log-command-density-${theme}-full.png`);
  await logPage.locator(`.phone[data-variant="log-${theme}"]`).screenshot({ path: full });
  logFull[theme] = full;
  await logPage.locator(`.phone[data-variant="log-${theme}"] [data-section="log-today"]`).screenshot({ path: path.join(screens, `log-logged-today-${theme}.png`) });
  await logPage.locator(`.phone[data-variant="log-${theme}"] [data-section="log-sources"]`).screenshot({ path: path.join(screens, `log-sources-${theme}.png`) });
}

async function makeBoard(items, name, title, width = 603) {
  const prepared = [];
  for (const item of items) {
    const image = sharp(item.path); const meta = await image.metadata(); const height = Math.round(meta.height * width / meta.width);
    prepared.push({ ...item, buffer: await image.resize({ width }).png().toBuffer(), width, height });
  }
  const gap = 28, top = 88, labelH = 52, boardWidth = prepared.length * width + (prepared.length - 1) * gap;
  const boardHeight = top + labelH + Math.max(...prepared.map(item => item.height)) + 28;
  let x = 0, labels = `<text x="18" y="42" fill="#f4f7f8" font-family="Arial,sans-serif" font-size="28" font-weight="700">${title}</text>`;
  const composites = [];
  for (const item of prepared) {
    labels += `<text x="${x + 12}" y="${top + 30}" fill="#9aa8b8" font-family="Arial,sans-serif" font-size="18">${item.label}</text>`;
    composites.push({ input: item.buffer, left: x, top: top + labelH }); x += width + gap;
  }
  const svg = `<svg width="${boardWidth}" height="${boardHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#070b11"/>${labels}</svg>`;
  await sharp(Buffer.from(svg)).composite(composites).png().toFile(path.join(screens, name));
}

await makeBoard([
  { label: 'Weekly · refined mineral light', path: briefingFull.weekly },
  { label: 'Midweek · refined mineral light', path: briefingFull.midweek },
], 'briefing-light-refined-pair.png', 'Recurring briefings · final mineral-light polish');
await makeBoard([
  { label: 'Weekly · previous accepted light', path: path.join(root, 'screens/weekly-light-before.png') },
  { label: 'Weekly · refined light', path: briefingFull.weekly },
], 'weekly-light-before-after.png', 'Weekly mineral light · surface rhythm before / after');
await makeBoard([
  { label: 'Midweek · previous accepted light', path: path.join(root, 'screens/midweek-light-before.png') },
  { label: 'Midweek · refined light', path: briefingFull.midweek },
], 'midweek-light-before-after.png', 'Midweek mineral light · surface rhythm before / after');
await makeBoard([
  { label: 'Weekly · previous', path: path.join(root, 'screens/weekly-light-before.png') },
  { label: 'Weekly · refined', path: briefingFull.weekly },
  { label: 'Midweek · previous', path: path.join(root, 'screens/midweek-light-before.png') },
  { label: 'Midweek · refined', path: briefingFull.midweek },
], 'briefing-light-before-after-four-up.png', 'Recurring briefing mineral light · accepted structure, refined surface rhythm', 402);
await makeBoard([
  { label: `Before · ${priorityCompaction.oldHeightPoints} pt`, path: path.join(screens, 'weekly-priority-muscle-groups-before.png') },
  { label: `After · ${priorityCompaction.newHeightPoints} pt`, path: path.join(screens, 'weekly-priority-muscle-groups-after.png') },
], 'weekly-priority-muscle-groups-before-after.png', 'Weekly Priority Muscle Groups · compact analytical rail');
await makeBoard([
  { label: 'Log · dark', path: logFull.dark },
  { label: 'Log · mineral light', path: logFull.light },
], 'log-command-density-dark-light.png', 'Locked Compact Command Center · realistic daily density');
await makeBoard([
  { label: 'Logged Today · dark', path: path.join(screens, 'log-logged-today-dark.png') },
  { label: 'Logged Today · mineral light', path: path.join(screens, 'log-logged-today-light.png') },
], 'log-logged-today-dark-light.png', 'Logged Today · Strength + Cardio + macros + centralized sources');
await makeBoard([
  { label: 'Sources · dark', path: path.join(screens, 'log-sources-dark.png') },
  { label: 'Sources · mineral light', path: path.join(screens, 'log-sources-light.png') },
], 'log-sources-dark-light.png', 'Centralized source / provenance treatment');
await makeBoard([
  { label: 'Locked Log · prior dark', path: path.join(root, 'screens/log-command-locked-before-dark.png') },
  { label: 'Density validation · dark', path: logFull.dark },
  { label: 'Locked Log · prior light', path: path.join(root, 'screens/log-command-locked-before-light.png') },
  { label: 'Density validation · light', path: logFull.light },
], 'log-prior-locked-vs-density.png', 'Compact Command Center · locked composition under realistic density', 402);

function luminance(hex) { const values = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return .2126 * values[0] + .7152 * values[1] + .0722 * values[2]; }
function contrast(a, b) { let left = luminance(a), right = luminance(b); if (left < right) [left, right] = [right, left]; return (left + .05) / (right + .05); }
const tintedSurfaces = ['#eee5d5','#e5ece8','#e9e5f1','#dfece6','#e1efea','#ebe8f2','#dce7eb','#e6e2ef'];
const briefingContrast = {
  primaryMinimum: Math.min(...tintedSurfaces.map(surface => contrast('#102638', surface))),
  secondaryMinimum: Math.min(...tintedSurfaces.map(surface => contrast('#4e6470', surface))),
  accentChecks: {
    amberOnEnergy: contrast('#875400', '#eee5d5'), greenOnTraining: contrast('#0b6b4d', '#dfece6'),
    purpleOnBody: contrast('#684ac7', '#e9e5f1'), cyanOnRecovery: contrast('#0d6670', '#e1efea'),
  },
};
briefingContrast.pass = briefingContrast.primaryMinimum >= 4.5 && briefingContrast.secondaryMinimum >= 4.5 && Object.values(briefingContrast.accentChecks).every(value => value >= 4.5);
if (!briefingContrast.pass) throw new Error(`Briefing contrast failed: ${JSON.stringify(briefingContrast)}`);

const validation = {
  pass: true,
  authorities: {
    prompt: 'bd1887ab95b5c8519ba6c8b0f792d038a71ffb41',
    nativeBuild85: 'b8ee8690b194cb90086b62816b9a2c8c400dc026',
    productionServer: '3c0f4aefddbb9a6886f6ad012443978303d47024',
    acceptedBriefingPair: '5284ed16539664574eff4d55fb336fc061361ae5',
    lockedLogExploration: 'ec425a96b2f4b726fd75ed8e3b45a8159c6e4ae8',
  },
  target: { widthPoints: 402, scale: 3, viewportHeightPoints: 874 },
  briefingRenders,
  priorityCompaction,
  briefingContrast,
  logRenders,
  logParity,
  logContentValidation,
  shippingIsolation: { nativeChanged: false, serverChanged: false, recoveryActivated: false, buildCreated: false },
};
await fs.writeFile(path.join(root, 'validation.json'), `${JSON.stringify(validation, null, 2)}\n`);
await previousPage.close(); await page.close(); await logPage.close(); await browser.close();
console.log(JSON.stringify({ pass: true, priorityCompaction, briefingHeights: Object.fromEntries(Object.entries(briefingRenders).map(([key,value]) => [key,value.heightPoints])), logHeights: Object.fromEntries(Object.entries(logRenders).map(([key,value]) => [key,value.heightPoints])), logParity, logContentValidation, briefingContrast }, null, 2));
