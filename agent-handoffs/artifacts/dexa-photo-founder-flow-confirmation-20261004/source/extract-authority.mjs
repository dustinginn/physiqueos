import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const nativeSHA = 'b8ee8690b194cb90086f6f62816b9a2c8c400dc026';
const serverSHA = '3c0f4aefddbb9a6886f6ad012443978303d47024';
const nativeFixture = JSON.parse(execFileSync('git', ['show', `${nativeSHA}:ios/PhysiqueOS/Resources/BriefingsFixture.json`], { encoding:'utf8' }));
const productionArtifact = JSON.parse(execFileSync('git', ['show', `${serverSHA}:src/fixtures/briefingFamilyV3/photoEventArtifact.json`], { encoding:'utf8' }));

const dexa = nativeFixture.find(item => item.id === 'dexa_event_dexa-fixture-005');
if (!dexa?.dexa?.progress?.timeline?.metrics?.length) throw new Error('Build 85 DEXA authority not found');
const photo = productionArtifact?.briefing?.photoEventNarrative;
if (!photo || photo.activeViews?.length !== 5 || photo.cardContent?.progress?.comparisons?.length !== 5) throw new Error('Five-pose production Photo authority not found');

fs.writeFileSync(path.join(root, 'DEXA-AUTHORITY.json'), `${JSON.stringify(dexa, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'PHOTO-PRODUCTION-AUTHORITY.json'), `${JSON.stringify(photo, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'source', 'authority.js'), `window.CONFIRMATION_AUTHORITY=${JSON.stringify({dexa,photo})};\n`);
