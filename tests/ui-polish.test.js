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
