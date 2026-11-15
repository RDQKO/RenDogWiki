// Runs only local fixture processes. No production URLs, keys or user data are used.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
const env = { ...process.env, DATABASE_URL:'postgres://postgres:postgres@127.0.0.1:6543/postgres', DB_SSL:'disable',
  JWT_SECRET:'local-audit-build-secret-2026', MANAGE_DELETE_PASSWORD:'local-audit-delete', ABLY_API_KEY:'', NEXT_TELEMETRY_DISABLED:'1' };
const processes=[];const results=[];let cookie='';
function start(args){const p=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});processes.push(p);let logs='';p.stdout.on('data',b=>{logs+=b});p.stderr.on('data',b=>{logs+=b});return {p,logs:()=>logs};}
async function waitUntil(fn){let last;for(let i=0;i<100;i++){try{if(await fn())return;}catch(e){last=e;}await new Promise(r=>setTimeout(r,100));}throw last??new Error('Local process did not become ready');}
async function call(method,path,body,status=200,auth=true){
 const r=await fetch('http://127.0.0.1:3100'+path,{method,headers:{'Content-Type':'application/json',...(auth&&cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data=raw;}
 results.push({method,path,status:r.status});assert.equal(r.status,status,`${method} ${path}: ${raw.slice(0,500)}`);return {r,data};
}
try{
 // Each fresh fixture has the same IDs; never reuse Data Cache from a previous fixture.
 await rm(new URL('../.next/cache/fetch-cache',import.meta.url),{recursive:true,force:true});
 const db=start(['scripts/local-audit-db.mjs']);
 await waitUntil(()=>db.logs().includes('fixture ready'));
 const app=start(['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3100']);
 await waitUntil(()=>app.logs().includes('Ready'));
 for(const path of ['/','/wiki?id=74&path=1','/login','/register','/wiki/write?path=1&id=74&title=Test'])await call('GET',path);
 for(const path of ['/api/bootstrap','/api/categories','/api/faq','/api/npcs?village_id=1','/api/head?village_id=1','/api/villages','/api/home/faqs','/api/home/popular','/api/home/search-keywords'])await call('GET',path);
 await call('PATCH','/api/head/1',{},401,false);
 await call('PUT','/api/faq/1',{title:'bad'},401,false);
 await call('POST','/api/chat/publish',{type:'new-message',data:{}},401,false);
 const login=await call('POST','/api/auth/login',{username:'writer',password:'LocalAudit123!'});
 cookie=login.r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 assert.equal((await call('GET','/api/auth/me')).data.role,'writer');
 const previous=(await call('GET','/api/documents?id=74')).data;
 const payload={...previous,content:[{type:'heading-one',children:[{text:'검증 목차'}]},{type:'paragraph',children:[{text:'HTTPSMOKE 고유검색문구'}]}],expectedUpdatedAt:previous.updated_at};
 const saved=(await call('POST','/api/save',payload)).data;assert.equal(saved.id,74);
 const fresh=(await call('GET','/api/documents/74')).data;assert.match(JSON.stringify(fresh.content),/HTTPSMOKE/);
 await call('POST','/api/save',payload,409);
 const search=(await call('GET','/api/search?query=HTTPSMOKE')).data;assert.ok(search.some(d=>d.id===74));
 const view=await call('POST','/api/view',{documentId:74,source:'search'});assert.equal(view.data.counted,true);
 cookie+='; '+view.r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 assert.equal((await call('POST','/api/view',{documentId:74,source:'search'})).data.counted,false);
 const sent=(await call('POST','/api/chat/send',{text:'local test'})).data;
 await call('POST','/api/chat/toggle-reaction',{message_id:sent.id,type:'like'});
 await call('POST','/api/chat/reaction',{id:sent.id,type:'dislike'});
 assert.ok((await call('GET','/api/chat/list')).data.messages.some(m=>m.id===sent.id));
 await call('PATCH','/api/head/1',{pictures:['https://example.test/local-fixture.png']});
 await call('PATCH','/api/villages/1',{name:'변경한 마을',icon:'/local.png'});
 await call('DELETE','/api/faq/1',undefined,403);
 console.log(JSON.stringify({passed:results.length,results},null,2));
 await writeFile('/tmp/rdwiki-http-smoke.json',JSON.stringify({passed:results.length,results},null,2));
}catch(error){console.error(error);process.exitCode=1;}
finally{for(const p of processes.reverse()){p.kill('SIGTERM');await Promise.race([once(p,'exit'),new Promise(r=>setTimeout(r,3000))]);}await rm(new URL('../.next/cache/fetch-cache',import.meta.url),{recursive:true,force:true});}
