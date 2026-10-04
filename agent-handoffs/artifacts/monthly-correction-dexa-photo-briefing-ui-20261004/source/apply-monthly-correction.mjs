import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const input = path.resolve(root, '..', 'monthly-ui-locked-briefing-family-translation-20261004', 'monthly-family.html');
const output = path.join(root, 'monthly-corrected.html');
let html = fs.readFileSync(input, 'utf8');

const footer = `<div class="hero-footer"><div><span class="label">Goal</span><strong>${'${'}sem('goal.goal',m.goal.goal)}</strong></div><div><span class="label">Phase</span><strong>${'${'}sem('goal.phase',m.goal.phase)}</strong></div></div>`;
const strategy = `<section class="section coach" data-section="monthly-strategy"><span class="eyebrow">${'${'}sem('strategy.label',m.strategy.label)}</span><p>${'${'}sem('strategy.copy',m.strategy.copy)}</p><span class="recommendation">Current strategy · ${'${'}sem('strategy.recommendation',m.strategy.recommendation)}</span></section>`;
const postHeroStrategy = `</section>${strategy}<section class="section training"`;
const closingInsertion = `</section><section class="section ahead" data-section="monthly-month-ahead">`;

for (const required of [footer, postHeroStrategy, closingInsertion]) {
  if (!html.includes(required)) throw new Error(`Monthly correction anchor missing: ${required.slice(0, 80)}`);
}

html = html.replace(footer, '');
html = html.replace(postHeroStrategy, `</section><section class="section training"`);
html = html.replace(closingInsertion, `</section>${strategy}<section class="section ahead" data-section="monthly-month-ahead">`);
fs.writeFileSync(output, html);

