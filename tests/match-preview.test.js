'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('match engine and adapter expose browser globals without CommonJS',()=>{
 const sandbox={window:{},Math,Map,Set,Number,String,Object,Array,Error};
 vm.runInNewContext(fs.readFileSync(path.join(root,'js/match/engine.js'),'utf8'),sandbox);
 vm.runInNewContext(fs.readFileSync(path.join(root,'js/match/adapter.js'),'utf8'),sandbox);
 assert.equal(typeof sandbox.window.FM4MatchEngine.createMatch,'function');
 assert.equal(typeof sandbox.window.FM4MatchEngine.stepMatch,'function');
 assert.equal(typeof sandbox.window.FM4MatchAdapter.createMatchFromGame,'function');
});
test('isolated match preview page has syntactically valid inline JavaScript',()=>{
 const html=fs.readFileSync(path.join(root,'match-preview.html'),'utf8');
 const start=html.lastIndexOf('<script>')+'<script>'.length;
 const end=html.indexOf('</script>',start);
 assert.ok(start>8&&end>start,'inline preview controller script exists');
 new vm.Script(html.slice(start,end));
 assert.match(html,/id="pause"/);
 assert.match(html,/id="events"/);
});
