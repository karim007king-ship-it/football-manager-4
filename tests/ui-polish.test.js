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
