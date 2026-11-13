const fs=require('fs'),vm=require('vm'),assert=require('assert'),{EventEmitter}=require('events');
const html=fs.readFileSync(__dirname+'/index.html','utf8').replace(/\r\n/g,'\n');
const app=html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)[1];
const auth=fs.readFileSync(__dirname+'/peer-auth.js','utf8');
const code=app.slice(app.indexOf('const ICE_CONFIG'),app.indexOf('function adoptCall('));
let media=0,answers=0,closed=0;const peers=new Map();
class Conn extends EventEmitter{constructor(peer){super();this.peer=peer;this.open=true;}send(d){const copy=structuredClone(d);setImmediate(()=>{if(this.other.open)this.other.emit('data',copy)})}close(){if(!this.open)return;this.open=false;this.emit('close');if(this.other.open){this.other.open=false;this.other.emit('close')}}}
class FakePeer extends EventEmitter{
 constructor(id){super();this.id=id;this.open=true;peers.set(id,this);setImmediate(()=>this.emit('open'));}
 connect(id){const a=new Conn(id),b=new Conn(this.id);a.other=b;b.other=a;setImmediate(()=>peers.get(id)?.emit('connection',b));return a;}
 call(id,stream,opts){media++;const caller=new EventEmitter();caller.open=true;caller.close=()=>{};const incoming=new EventEmitter();Object.assign(incoming,{peer:this.id,metadata:opts.metadata,answer(){answers++},close(){closed++}});setImmediate(()=>peers.get(id)?.emit('call',incoming));return caller;}
 destroy(){this.destroyed=true;}
}
function client(me,secret='same-test-secret',count=5){
 const state={mode:'kiosk',me,count,roomHash:'testhash',authToken:secret,started:true,names:{},calls:new Map(),authenticated:new Map(),pendingAuth:new Map(),localStream:{fake:true}};
 const c={state,crypto:globalThis.crypto,TextEncoder,Uint8Array,URL,setTimeout,clearTimeout,queueMicrotask,Peer:FakePeer,toast(){},refreshTileName(){},setTileStatus(){},siteName:n=>'office'+n,peerIdFor:n=>'noelwindow-testhash-'+n,adoptCall:(call,n)=>state.calls.set(n,call)};
 vm.createContext(c);vm.runInContext(auth,c);vm.runInContext(code,c);vm.runInContext('initPeer()',c);return c;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const cs=Array.from({length:5},(_,i)=>client(i+1));await sleep(300);
 assert.equal(media,10,'five peers should establish ten authenticated outgoing media calls');assert.equal(answers,10);assert.equal(cs.reduce((n,c)=>n+c.state.authenticated.size,0),20);
 const target=cs[4];const fake={peer:'attacker-1',metadata:{token:'same-test-secret'},answer(){throw Error('unauthorized media answer')},close(){closed++}};
 target.state.peer.emit('call',fake);assert.equal(closed,1);
 target.state.peer.emit('call',{...fake,peer:'noelwindow-testhash-1',metadata:{proof:'bad'}});assert.equal(closed,2);
 assert.equal(target.remoteNumber('otherroom-1'),null);assert.equal(target.remoteNumber('noelwindow-testhash-0'),null);assert.equal(target.remoteNumber('noelwindow-testhash-5'),null);assert.equal(target.remoteNumber('noelwindow-testhash-6'),null);
 // A peer who occupies the right ID without the room secret receives no media.
 peers.clear();media=0;answers=0;const good=client(1,'right-secret',2),bad=client(2,'wrong-secret',2);await sleep(150);
 assert.equal(media,0);assert.equal(answers,0);assert.equal(good.state.authenticated.size,0);assert.equal(bad.state.authenticated.size,0);
 // Legacy clients revealing a token cannot bypass the new challenge.
 bad.state.peer.emit('call',{...fake,peer:'noelwindow-testhash-1',metadata:{token:'wrong-secret'}});assert.equal(closed,3);
 console.log('PASS: 5-peer full mesh (10 media calls), wrong-room/self/out-of-range IDs, wrong proof, wrong secret, and legacy bypass rejected');
})().catch(e=>{console.error(e);process.exitCode=1});
const crypto=require('crypto');
const cspHtml=fs.readFileSync(__dirname+'/index.html','utf8').replace(/\r\n/g,'\n');
const digest=crypto.createHash('sha256').update(cspHtml.match(/<script>([\s\S]*?)<\/script>/)[1]).digest('base64');
assert(cspHtml.includes("'sha256-"+digest+"'"),'CSP hash must match script');
assert(!/script-src[^;]*unsafe-inline/.test(cspHtml));
assert(!/metadata:\s*\{\s*token/.test(cspHtml));
assert(!cspHtml.includes('<script src="https://accounts.google.com/gsi/client"'));
console.log('PASS: CSP hash and secret metadata checks');
