const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(require('path').join(__dirname,'index.html'),'utf8');
const js=html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)[1];new vm.Script(js);
const start=js.indexOf('function validateKioskSettings('),end=js.indexOf('function showKioskSetup(');
const ctx={URL,URLSearchParams};vm.createContext(ctx);vm.runInContext(js.slice(start,end),ctx);
let checks=0;const check=f=>{f();checks++};
const saved={room:'test-only-room-12345',count:3,me:2,name:'既存日進'};
const p=ctx.buildSalesgridInvites(saved,'https://example.test/index.html?m=old#anything');
check(()=>assert.equal(p.count,5));check(()=>assert.deepEqual(Array.from(p.added,x=>x.me),[4,5]));
check(()=>assert.deepEqual(Array.from(p.existing,x=>x.me),[1,2,3]));
for(const link of [...p.added,...p.existing])check(()=>{const u=new URL(link.url),s=JSON.parse(new URLSearchParams(u.hash.slice(1)).get('kiosk'));assert.equal(u.search,'');assert.equal(s.room,saved.room);assert.equal(s.count,5);assert.equal(s.me,link.me);assert(ctx.validateKioskSettings(s));});
check(()=>assert.equal(saved.count,3));check(()=>assert.equal(ctx.buildSalesgridInvites({...saved,count:2},'https://example.test/').count,4));
for(const bad of [null,{}, {...saved,count:4},{...saved,count:5},{...saved,room:'short'},{...saved,count:2.5},{...saved,me:0}])check(()=>assert.throws(()=>ctx.buildSalesgridInvites(bad,'https://example.test/')));
// Import behavior with a minimal DOM: no media/network, actual production import block.
const boot=js.slice(js.indexOf('(function(){\n  const query = new URLSearchParams(location.search);'),js.indexOf('/* ---- モード切替タブ'));
function load(data,existing=null,search=''){
 const els={}; const get=id=>els[id]||(els[id]={value:'',classList:{toggle(){}}});
 if(existing){get('inRoom').value=existing.room;get('inName').value=existing.name;get('inMe').value=String(existing.me)}
 const env={...ctx,JSON,LS_KEY: 'noel-window',location:{search,pathname:'/',hash:'#kiosk='+encodeURIComponent(JSON.stringify(data))},localStorage:{getItem:()=>existing?JSON.stringify(existing):null},$:get,showKioskSetup(){},rebuildMeOptions(){},history:{replaceState(){env.cleared=true}}};
 vm.createContext(env);vm.runInContext(boot,env);return {els,env};
}
const added=JSON.parse(new URLSearchParams(new URL(p.added[0].url).hash.slice(1)).get('kiosk'));
check(()=>{const r=load(added);assert.equal(r.els.inName.value,'セールスグリッド一宮');assert.equal(r.els.inMe.value,'4');assert(r.env.cleared)});
check(()=>{const r=load(added,saved);assert.equal(r.els.inMe.value,'2');assert.match(r.els.salesgridStatus.textContent,/別の拠点/)});
check(()=>{const r=load({...added,me:2,name:undefined},saved);assert.equal(r.els.inCount.value,'5');assert.equal(r.els.inName.value,saved.name)});
check(()=>{const r=load({...added,me:1,name:undefined},saved);assert.match(r.els.salesgridStatus.textContent,/別の拠点用/)});
check(()=>{const r=load({...added,count:99});assert.match(r.els.salesgridStatus.textContent,/正しくありません/)});
check(()=>{const r=load(added,null,'?m=customer');assert.equal(Object.keys(r.els).length,0)});
check(()=>{const r=load(added,null,'?room=sv-room');assert.equal(Object.keys(r.els).length,0)});
console.log('PASS '+checks+' checks; full script parses');

