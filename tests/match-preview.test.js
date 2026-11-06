'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('match engine and adapter expose browser globals without CommonJS',()=>{
 const engineSandbox={window:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'js/match/engine.js'),'utf8'),engineSandbox);
 const adapterSandbox={window:{FM4MatchEngine:engineSandbox.window.FM4MatchEngine}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'js/match/adapter.js'),'utf8'),adapterSandbox);
 assert.equal(typeof engineSandbox.window.FM4MatchEngine.createMatch,'function');
 assert.equal(typeof engineSandbox.window.FM4MatchEngine.stepMatch,'function');
 assert.equal(typeof adapterSandbox.window.FM4MatchAdapter.createMatchFromGame,'function');
});
test('isolated match preview page has syntactically valid inline JavaScript',()=>{
 const html=fs.readFileSync(path.join(root,'match-preview.html'),'utf8');
 const start=html.lastIndexOf('<script>')+'<script>'.length;
 const end=html.indexOf('</script>',start);
 assert.ok(start>8&&end>start,'inline preview controller script exists');
 new vm.Script(html.slice(start,end));
 assert.match(html,/id="pause"/);
 assert.match(html,/id="events"/);
 assert.match(html,/id="subApply"/);
 assert.match(html,/js\\/match\\/substitutions\\.js/);
 assert.match(html,/مهاجم احتياطي 2/);
 assert.match(html,/FM4Substitutions\\.substitutePlayer/);
});
