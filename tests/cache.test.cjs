const assert=require('node:assert/strict');
const test=require('node:test');
const {makeLoader}=require('./helpers/load-ts.cjs');
function setup(){
 let fail=false;
 const state={};
 const load=makeLoader({'next/cache':{
   unstable_cache:(fn)=>async()=>{if(fail)throw new Error('cache unavailable');return fn();},
   revalidateTag:()=>{},
 }},{global:state,console:{warn(){}}});
 return {api:load('app/wiki/lib/cache.ts'),state,setFail(value){fail=value;}};
}
test('one cache loader serves concurrent identical requests',async()=>{
 const {api}=setup();let calls=0;let release;
 const work=()=>{calls++;return new Promise(r=>{release=r;});};
 const first=api.cached('a',{tags:['docs']},work);
 const second=api.cached('a',{tags:['docs']},work);
 await new Promise(r=>setImmediate(r));release('value');
 assert.equal(await first,'value');assert.equal(await second,'value');assert.equal(calls,1);
});
test('invalidation during a pending read cannot repopulate the local fallback',async()=>{
 const {api,state,setFail}=setup();let release;
 const pending=api.cached('a',{tags:['docs']},()=>new Promise(r=>{release=r;}));
 await new Promise(r=>setImmediate(r));api.invalidate('docs');release('old');await pending;
 assert.equal(state.__wiki_local_cache__.has('a'),false);
 setFail(true);await assert.rejects(api.cached('a',{tags:['docs']},()=> 'new'));
});
test('fallback retention and cache entry count are bounded',async()=>{
 const {api,state,setFail}=setup();
 for(let i=0;i<600;i++)await api.cached(`key:${i}`,{ttlSec:1},()=>i);
 assert.ok(state.__wiki_local_cache__.size<=512);
 const last=state.__wiki_local_cache__.get('key:599');last.expiresAt=Date.now()-6*60*1000;
 setFail(true);await assert.rejects(api.cached('key:599',{ttlSec:1},()=>0));
});
