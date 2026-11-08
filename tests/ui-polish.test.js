const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('responsive UI stylesheet is linked, cached offline and packaged in Android APK', () => {
  const html = read('index.html');
  const sw = read('sw.js');
  const workflow = read('.github/workflows/android-apk.yml');

  assert.match(html, /href=["']ui-polish\.css["']/);
  assert.match(sw, /ui-polish\.css/);
  assert.match(workflow, /ui-polish\.css/);
  assert.match(workflow, /cp index\.html manifest\.json sw\.js ui-polish\.css www\//);
});

test('live-match layout activates only after validation and is removed on exit', () => {
  const html = read('index.html');

  assert.match(html, /if\(busy\)return;if\(!cup&&G\.cup&&G\.cup\.due\)return/);
  assert.match(html, /if\(S\.xi\.length<11\)return[\s\S]{0,180}classList\.add\('match-live'\)/);
  assert.match(html, /classList\.add\('match-live'\)/);
  assert.match(html, /classList\.remove\('match-live'\)/);
  assert.match(html, /restoreMatchSession[\s\S]{0,900}classList\.add\('match-live'\)/);
});

test('goalkeeper attributes are generated, displayed and improved through training', () => {
  const html = read('index.html');
  for (const attribute of ['gkReflexes', 'gkHandling', 'gkPositioning', 'gkOneOnOne', 'gkDistribution']) {
    assert.match(html, new RegExp(attribute));
  }
  assert.match(html, /const keeperStats=pos==='GK'\?\{/);
  assert.match(html, /p\.pos==='GK'\?'<br/);
  assert.match(html, /if\(p\.pos==='GK'\)\['gkReflexes','gkHandling','gkPositioning','gkOneOnOne','gkDistribution'\]/);
});

test('live match screen has a structured scoreboard, telemetry and tactical strip', () => {
  const html = read('index.html');
  const css = read('ui-polish.css');

  assert.match(html, /class="match-live-scoreline"/);
  assert.match(html, /class="match-live-stats"/);
  assert.match(html, /class="match-live-tactical-strip"/);
  assert.match(html, /function sb\(\)[\s\S]{0,2600}match-live-score-digits/);
  assert.match(css, /body\.match-live #sb \.match-live-card/);
  assert.match(css, /body\.match-live #ctl\{\s*position:sticky/);
});

test('match event timeline separates minute stamps and preserves accessible log semantics', () => {
  const html = read('index.html');
  const css = read('ui-polish.css');

  assert.match(html, /id="console" role="log" aria-live="polite"/);
  assert.match(html, /function matchLogNode\(entry\)/);
  assert.match(html, /match-event-time/);
  assert.match(html, /restoreMatchLog\(\)[\s\S]{0,180}matchLogNode\(entry\)/);
  assert.match(css, /\.match-event-time/);
  assert.match(css, /\.ll\.log-goal/);
  assert.match(css, /\.ll\.log-bad/);
});

test('match presentation exposes explicit halftime, extra-time, penalty and full-time states',()=>{
 const html=read('index.html');
 const css=read('ui-polish.css');
 for(const state of ['live','halftime','extratime','penalties','fulltime']){
  assert.match(html,new RegExp('\\b'+state+'\\s*:'));
 }
 assert.match(html,/match-live-card match-state-\$\{matchState\}/);
 assert.match(html,/match-live-phase-banner/);
 assert.match(html,/role="status" aria-live="polite"/);
 assert.match(html,/استراحة بين الشوطين/);
 assert.match(html,/وقت إضافي/);
 assert.match(html,/ركلات الترجيح/);
 assert.match(html,/صافرة النهاية/);
 assert.match(css,/\.match-state-halftime/);
 assert.match(css,/\.match-state-extratime/);
 assert.match(css,/\.match-state-penalties/);
 assert.match(css,/\.match-state-fulltime/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('extra-time and penalty score changes repaint the live phase banner immediately',()=>{
 const html=read('index.html');
 assert.match(html,/M\.et=1;M\.min=90;M\.end=120;log\([\s\S]{0,100}sb\(\);return/);
 assert.match(html,/penalties:`ركلات الترجيح \$\{M\.so\?M\.so\.u:0\}/);
 assert.match(html,/function soKick\(\)\{M\.so\.ph=0;sb\(\)/);
 assert.match(html,/function soOpp\(\)\{M\.so\.ph=1;sb\(\)/);
});

test('shared choice modal is safe, accessible and keyboard-operable',()=>{
 const html=read('index.html');
 const css=read('ui-polish.css');
 assert.match(html,/function menu\(title,items,cancel\)/);
 assert.match(html,/content\.replaceChildren\(\)/);
 assert.match(html,/button\.textContent=String\(item\.l/);
 assert.doesNotMatch(html,/mtxt'\)\.innerHTML=.*menuPick/);
 assert.match(html,/aria-modal','true'/);
 assert.match(html,/aria-labelledby','match-menu-heading'/);
 assert.match(html,/e\.key==='Escape'&&menuCanCancel/);
 assert.match(html,/e\.key!=='Tab'/);
 assert.match(html,/function menuPick\(i\)\{if\(!MN\[i\]\)return/);
 assert.match(css,/\.match-menu-list/);
 assert.match(css,/\.match-menu-option:focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test('lineup screen renders an accessible tactical pitch and separate bench without changing selection rules',()=>{
 const html=read('index.html');
 const css=read('ui-polish.css');
 assert.match(html,/function uiEsc\\(value\\)/);
 assert.match(html,/class="lineup-pitch"/);
 assert.match(html,/class="lineup-line lineup-line-\\$\\{pos\\.toLowerCase\\(\\)\\}"/);
 assert.match(html,/data-position="\\$\\{pos\\}" data-player-id="\\$\\{uiEsc\\(p\\.id\\)\\}"/);
 assert.match(html,/c\\.querySelectorAll\\('\\.lineup-player'\\)\\.forEach/);
 assert.match(html,/luPick\\(button\\.dataset\\.position,button\\.dataset\\.playerId\\)/);
 assert.match(html,/const bench=mine\\(\\)\\.filter\\(p=>!S\\.xi\\.includes\\(p\\)\\)/);
 assert.match(html,/function luPick\\(pos,yid\\)[\\s\\S]{0,360}p\\.pos==pos&&!p\\.inj&&!S\\.xi\\.includes\\(p\\)/);
 assert.match(html,/function luAuto\\(\\)\\{G\\.lu=null;save\\(\\);go\\('lineup'\\)\\}/);
 assert.match(css,/\\.lineup-pitch/);
 assert.match(css,/\\.lineup-player:focus-visible/);
 assert.match(css,/\\.lineup-bench/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});