import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SKILL = join(import.meta.dirname, '..', 'skills', 'taste-skill');
const DRAW = join(SKILL, 'scripts', 'draw.mjs');
const lib = (name) => JSON.parse(readFileSync(join(SKILL, 'library', name + '.json'), 'utf8'));

// Each test deals into its own folder with its own history, so earlier draws never change the deal.
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'taste-draw-'));
  const run = (...args) => {
    const r = spawnSync(process.execPath, [DRAW, ...args, '--out', dir], { encoding: 'utf8', env: { ...process.env, TASTE_SKILL_HISTORY: join(dir, 'history.json') } });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const sheetFile = join(dir, 'direction.json');
  return {
    run,
    deal: (...extra) => run('--sector', 'restaurant', '--brief', 'a bakery on rue des Sept Portes', '--sections', 'about,list,contact,footer', '--direction', 'dark-room', '--seed', '1177841239', ...extra),
    sheet: () => JSON.parse(readFileSync(sheetFile, 'utf8')),
    // change the saved sheet, then reprint it: the notes and the recipe are worked out when the sheet is printed
    edit: (fn) => { const s = JSON.parse(readFileSync(sheetFile, 'utf8')); fn(s); writeFileSync(sheetFile, JSON.stringify(s)); },
  };
}

test('the dark room deals its dark photographs first', () => {
  const w = workspace();
  assert.equal(w.deal().code, 0);
  const tones = w.sheet().photos.photos.map((ph) => ph.tone);
  const rank = (t) => (t === 'dark' ? 0 : t === 'mid' ? 1 : 2);
  assert.ok(tones.length >= 6);
  assert.deepEqual(tones, [...tones].sort((a, b) => rank(a) - rank(b)), tones.join(' '));
  assert.ok(tones.filter((t) => t === 'dark').length >= 4, tones.join(' '));
});

test('a section dealt without a heading is told how the inspector reads one; a footer is not', () => {
  const w = workspace();
  w.deal();
  const sections = lib('sections');
  w.edit((s) => {
    s.sections = ['about-portrait-drop-cap', 'pricing-two-plans-two-fields', 'contact-email-display', 'footer-wordmark-on-last-photograph'].map((id) => sections.find((x) => x.id === id));
  });
  const note = /It has no heading\. The inspector takes text at least 1\.35 times the body size/;
  assert.match(w.run('--show', 'section:about').out, note);
  assert.match(w.run('--show', 'section:contact').out, note);
  assert.doesNotMatch(w.run('--show', 'section:pricing').out, note, '"No heading spans the two fields" is not a missing heading');
  assert.doesNotMatch(w.run('--show', 'section:footer').out, note);
});

test('heavy type asked of a light single-weight face is flagged; a face heavy at its one weight is not', () => {
  const w = workspace();
  w.deal();
  const types = lib('type');
  const hero = lib('heroes').find((h) => /\bheavy face\b/.test(h.blueprint));
  w.edit((s) => { s.hero = hero; s.type = types.find((t) => t.id === 'gambarino-general'); });
  assert.match(w.run('--show', 'hero').out, /It asks for heavy type; Gambarino has weight 400 only/);
  w.edit((s) => { s.type = types.find((t) => t.id === 'anton-work'); });
  assert.doesNotMatch(w.run('--show', 'hero').out, /It asks for heavy type/);
});

test('reference cards leave out the hero capture and lessons that name a banned device', () => {
  const w = workspace();
  w.deal();
  const sites = lib('sites');
  const madie = sites.find((x) => x.id === 'opl-madie');
  w.edit((s) => { s.references = [madie]; });
  const refs = w.run('--show').out.split('## 12. Real references')[1].split('## Always')[0];
  assert.doesNotMatch(refs, /^\s+Hero:/m);
  assert.doesNotMatch(refs, /outline strokes/, 'the outline-headline lesson is not offered');
  assert.match(refs, /Worth taking: /);
  // the full notes keep everything
  assert.match(w.run('--site', 'opl-madie').out, /Hero: [\s\S]*outline strokes/);
});

test('the dealt motion prints its recipe with the tokens and the html.js line it needs', () => {
  const w = workspace();
  w.deal();
  const motions = lib('motions');
  const motion = (id) => w.edit((s) => { s.motion = motions.find((m) => m.id === id); });
  motion('masked-headline');
  let out = w.run('--show', 'motion').out;
  assert.match(out, /--ease-out: cubic-bezier/);
  assert.match(out, /classList\.add\('js'\)/);
  assert.match(out, /Scroll timelines need a scroller to watch/, 'the overflow: hidden warning travels with every recipe');
  assert.match(out, /Observe the frame, clip the picture/);
  assert.match(out, /^#### Masked line reveal/m);
  assert.doesNotMatch(out, /It waits for the class `is-in`/);
  motion('shutter-image');
  out = w.run('--show', 'motion').out;
  assert.match(out, /^#### Image shutter/m);
  assert.match(out, /It waits for the class `is-in`[\s\S]*IntersectionObserver/, 'a recipe that waits for is-in comes with the observer');
  motion('edge-marquee');
  assert.doesNotMatch(w.run('--show', 'motion').out, /^Recipe \(/m);
  motion('stillness');
  out = w.run('--show', 'motion').out;
  assert.doesNotMatch(out, /the one loud moment|Do not add a load animation or scroll reveals/);
  assert.match(out, /The rest of the motion layer is still required/);
});

test('--show <part> reprints one part with the page\'s tokens; --show alone reprints the whole sheet', () => {
  const w = workspace();
  const dealt = w.deal().out;
  assert.equal(w.run('--show').out, dealt);
  const part = w.run('--show', 'section:list');
  assert.equal(part.code, 0);
  assert.ok(part.out.length < dealt.length / 2, `${part.out.length} of ${dealt.length}`);
  for (const must of ['## 1. The idea', '## 2. Composition', '## 3. Type', '--step-body', '## 4. Colour', '--bg:', '### 2. list', '## Always']) assert.ok(part.out.includes(must), must);
  for (const not of ['### 1. about', '### 3. contact', '## 5. Imagery', '## 6. Hero', '## 12. Real references']) assert.ok(!part.out.includes(not), not);
  const hero = w.run('--show', 'hero').out;
  assert.ok(hero.includes('## 6. Hero') && hero.includes('## 3. Type') && !hero.includes('## 7. Sections'));
  for (const name of ['imagery', 'motion']) {
    const out = w.run('--show', name).out;
    for (const must of ['## 1. The idea', '## 2. Composition', '--step-body', '--bg:']) assert.ok(out.includes(must), `${name}: ${must}`);
    assert.ok(!out.includes('## 6. Hero') && !out.includes('## 7. Sections'), name);
  }
  assert.equal(w.run('--show', 'section:pricing').code, 2);
  assert.equal(w.run('--show', 'nonsense').code, 2);
});

test('type settings do not contradict the headline rules', () => {
  for (const t of lib('type')) {
    const s = t.display.settings + ' ' + t.note;
    assert.doesNotMatch(s, /three-line|two-tone|connecting words|roman and italic together/i, t.id);
  }
});
