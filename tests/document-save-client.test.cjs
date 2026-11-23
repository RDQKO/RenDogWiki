const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { makeLoader } = require('./helpers/load-ts.cjs');

test('document saving reconciles a gateway timeout using the exact same request ID and content', async () => {
  const calls=[];
  const {createDocumentSaveAttempt,sendDocumentSave}=makeLoader({}, {
    crypto:webcrypto, setTimeout:fn=>setTimeout(fn,0),
    fetch:async(_url,options)=>{
      calls.push(options);
      return calls.length===1 ? new Response('FUNCTION_INVOCATION_TIMEOUT',{status:504})
        : Response.json({success:true,id:123,updatedAt:'2026-11-23T00:00:00.000Z'});
    },
  })('app/wiki/lib/documentSaveClient.ts');
  const snapshot=JSON.stringify({title:'중복 방지',content:[{type:'paragraph',children:[{text:'본문'}]}]});
  const attempt=createDocumentSaveAttempt(snapshot);
  const {response,saved}=await sendDocumentSave(attempt);
  assert.equal(response.status,200);assert.equal(saved.id,123);assert.equal(calls.length,2);
  assert.equal(calls[0].body,calls[1].body);assert.ok(JSON.parse(calls[0].body).saveRequestId);
  assert.equal(attempt.snapshot,snapshot);assert.equal(calls[0].credentials,'include');
});

test('a network failure is retried once and a content conflict is returned without another write', async () => {
  let calls=0;
  const client=makeLoader({}, {crypto:webcrypto,setTimeout:fn=>setTimeout(fn,0),fetch:async()=>{
    calls++;if(calls===1)throw new TypeError('network');
    return Response.json({error:'다른 사용자가 수정했습니다.'},{status:409});
  }})('app/wiki/lib/documentSaveClient.ts');
  const attempt=client.createDocumentSaveAttempt(JSON.stringify({title:'충돌'}));
  const result=await client.sendDocumentSave(attempt);
  assert.equal(result.response.status,409);assert.equal(calls,2);
  assert.match(result.saved.error,/다른 사용자/);
});
