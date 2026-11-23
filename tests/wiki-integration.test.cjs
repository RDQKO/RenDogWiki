const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const postgres = require('postgres');
const { NextRequest } = require('next/server');
const { makeLoader } = require('./helpers/load-ts.cjs');

// All writes run against an in-memory Postgres database. No hosted credentials are read.
test('wiki API and SQL integration against isolated Postgres', async (t) => {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/wiki.sql'), 'utf8'));
  const { documentSaveRequestSchema } = await import('../scripts/setup-document-save-requests.mjs');
  await db.exec(documentSaveRequestSchema); await db.exec(documentSaveRequestSchema);
  const server = new PGLiteSocketServer({ db, maxConnections: 10, host: '127.0.0.1', port: 0 });
  await server.start();
  const port = server.server.address().port;
  const sql = postgres({ host: '127.0.0.1', port, database: 'postgres', username: 'postgres', password: 'postgres', prepare: false, max: 1, onnotice() {} });
  t.after(async () => { await sql.end(); await server.stop(); await db.close(); });
  let user = null;
  const invalidations = [];
  const afterTasks = [];
  process.env.MANAGE_DELETE_PASSWORD='integration-delete';
  const dbModule = { sql, withTx: (fn) => sql.begin((tx) => fn(tx)), runDbRead: (_name, fn) => fn(), isTransientDbError: () => false };
  const authModule = { getAuthUser: async () => user };
  const load = makeLoader({
    'next/server': { ...require('next/server'), after: task => afterTasks.push(task) },
    './db': dbModule, '@/wiki/lib/db': dbModule, '@/app/wiki/lib/db': dbModule,
    '@/wiki/lib/saveConnection': { withSaveConnection: fn => fn(sql) },
    '@/wiki/lib/auth': authModule, '@/app/wiki/lib/auth': authModule,
    'next/cache': { unstable_cache: (fn) => fn, revalidateTag: (tag) => invalidations.push(tag) },
  });
  const request = (url, body, method = 'POST', headers = {}) => new NextRequest(`http://localhost${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const asUser = async (id) => { user = id ? (await sql`SELECT * FROM users WHERE id = ${id}`)[0] : null; };
  const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });
  const save = load('app/api/save/route.ts').POST;
  const valid = { title: '검증 문서', path: '1', tags: ['테스트'], content: [
    { type: 'heading-one', children: [{ text: '목차' }] },
    { type: 'paragraph', children: [{ text: '검색 고유키워드와 보존할 본문' }] },
  ] };
  let docId;

  await t.test('anonymous mutation attempts stop before changing data', async () => {
    await asUser(null);
    for (const [file, method, url, body] of [
      ['save','POST','/api/save',valid], ['faq/[id]','PUT','/api/faq/1',{title:'변조'}],
      ['head/[id]','PATCH','/api/head/1',{}], ['villages/[id]','PATCH','/api/villages/1',{}],
      ['chat/publish','POST','/api/chat/publish',{type:'new-message',data:{}}],
    ]) {
      const response = await load(`app/api/${file}/route.ts`)[method](request(url,body,method),params(1));
      assert.equal(response.status,401,file);
    }
    assert.equal((await sql`SELECT count(*)::int AS n FROM documents`)[0].n,0);
  });

  await t.test('save commits content, metadata and search sections with the same document ID', async () => {
    await asUser(1);
    const response = await save(request('/api/save',valid));
    assert.equal(response.status,200,await response.clone().text());
    const body = await response.json(); docId = body.id;
    assert.equal((await sql`SELECT count(*)::int AS n FROM document_contents WHERE document_id=${docId}`)[0].n,1);
    assert.equal((await sql`SELECT plain_text FROM document_search_sections WHERE document_id=${docId}`)[0].plain_text,'검색 고유키워드와 보존할 본문');
    assert.ok(body.updatedAt);
  });

  await t.test('missing ID, invalid content and duplicate titles cannot create or erase data', async () => {
    for (const [body,status] of [
      [{...valid,id:9999},404], [{...valid,id:'invalid'},400], [{...valid,id:docId,content:'{broken'},400], [valid,409],
    ]) assert.equal((await save(request('/api/save',body))).status,status);
    assert.equal((await sql`SELECT count(*)::int AS n FROM documents`)[0].n,1);
    assert.match((await sql`SELECT content FROM document_contents WHERE document_id=${docId}`)[0].content,/보존할 본문/);
  });

  await t.test('stale editor saves receive 409 and preserve the newer edit', async () => {
    const first = await (await save(request('/api/save',{...valid,id:docId}))).json();
    const newer = await save(request('/api/save',{...valid,id:docId,title:'최신 문서',expectedUpdatedAt:first.updatedAt}));
    assert.equal(newer.status,200,await newer.clone().text());
    const stale = await save(request('/api/save',{...valid,id:docId,title:'낡은 편집',expectedUpdatedAt:first.updatedAt}));
    assert.equal(stale.status,409);
    assert.equal((await sql`SELECT title FROM documents WHERE id=${docId}`)[0].title,'최신 문서');
  });

  await t.test('a search-index failure rolls back metadata and content too', async () => {
    await sql`ALTER TABLE document_search_sections ADD CONSTRAINT test_reject_section CHECK (plain_text NOT LIKE '%ROLLBACK%')`;
    const response = await save(request('/api/save',{...valid,id:docId,title:'반영되면 안 됨',content:[{type:'paragraph',children:[{text:'ROLLBACK'}]}]}));
    assert.equal(response.status,500);
    assert.equal((await sql`SELECT title FROM documents WHERE id=${docId}`)[0].title,'최신 문서');
    assert.match((await sql`SELECT content FROM document_contents WHERE document_id=${docId}`)[0].content,/보존할 본문/);
    await sql`ALTER TABLE document_search_sections DROP CONSTRAINT test_reject_section`;
  });

  for (const code of ['55P03', '40P01', '40001']) {
    await t.test(`save retries a confirmed rollback (${code}) without partial metadata or duplicate content`, async () => {
      await sql.unsafe(`CREATE SEQUENCE test_save_retry_seq;
        CREATE FUNCTION fail_save_once() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF nextval('test_save_retry_seq')=1 THEN RAISE EXCEPTION 'temporary rollback' USING ERRCODE='${code}'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER fail_save_once BEFORE INSERT ON document_search_sections FOR EACH ROW EXECUTE FUNCTION fail_save_once();`);
      try {
        const response = await save(request('/api/save', { ...valid, id: docId, title: '최신 문서' }));
        assert.equal(response.status, 200, await response.clone().text());
        assert.equal(Number((await sql`SELECT last_value FROM test_save_retry_seq`)[0].last_value), 2);
        assert.equal((await sql`SELECT count(*)::int AS n FROM document_contents WHERE document_id=${docId}`)[0].n, 1);
        assert.match((await sql`SELECT content FROM document_contents WHERE document_id=${docId}`)[0].content, /보존할 본문/);
      } finally {
        await sql.unsafe('DROP TRIGGER fail_save_once ON document_search_sections; DROP FUNCTION fail_save_once(); DROP SEQUENCE test_save_retry_seq;');
      }
    });
  }

  await t.test('persistent lock failure returns 503 after two attempts and preserves the existing document', async () => {
    const before = (await sql`SELECT title,updated_at FROM documents WHERE id=${docId}`)[0];
    await sql.unsafe(`CREATE SEQUENCE test_save_retry_seq;
      CREATE FUNCTION fail_save_always() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM nextval('test_save_retry_seq'); RAISE EXCEPTION 'busy' USING ERRCODE='55P03'; END $$;
      CREATE TRIGGER fail_save_always BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION fail_save_always();`);
    try {
      const response = await save(request('/api/save', { ...valid, id: docId, title: '절대 저장하지 않음' }));
      assert.equal(response.status, 503); assert.ok(response.headers.get('Retry-After'));
      assert.equal(Number((await sql`SELECT last_value FROM test_save_retry_seq`)[0].last_value), 2);
      assert.deepEqual((await sql`SELECT title,updated_at FROM documents WHERE id=${docId}`)[0], before);
    } finally {
      await sql.unsafe('DROP TRIGGER fail_save_always ON documents; DROP FUNCTION fail_save_always(); DROP SEQUENCE test_save_retry_seq;');
    }
  });

  await t.test('post-commit cache failure and deferred logging do not turn a successful save into 500', async () => {
    const background = []; let logged = false;
    const robustLoad = makeLoader({
      './db': dbModule, '@/wiki/lib/db': dbModule, '@/app/wiki/lib/db': dbModule,
    '@/wiki/lib/saveConnection': { withSaveConnection: fn => fn(sql) },
      '@/wiki/lib/auth': authModule, '@/app/wiki/lib/auth': authModule,
      'next/cache': { unstable_cache: fn => fn, revalidateTag() {} },
      'next/server': { ...require('next/server'), after: task => background.push(task) },
      '@/wiki/lib/documentCache': { invalidateDocumentCache() { throw new Error('temporary cache failure'); } },
      '@/wiki/lib/activity': { resolveCategoryName: async () => '분류', logActivity: async () => { logged = true; } },
    });
    const response = await robustLoad('app/api/save/route.ts').POST(request('/api/save', { ...valid, id: docId, title: '최신 문서' }));
    assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
    assert.equal(logged, false); assert.equal(background.length, 1);
    await background[0](); assert.equal(logged, true);
    assert.match((await sql`SELECT content FROM document_contents WHERE document_id=${docId}`)[0].content, /보존할 본문/);
  });

  await t.test('replaying a committed request returns the same result before optimistic concurrency checks', async () => {
    const payload={...valid,id:docId,title:'최신 문서',saveRequestId:require('node:crypto').randomUUID()};
    payload.expectedUpdatedAt=(await sql`SELECT updated_at FROM documents WHERE id=${docId}`)[0].updated_at;
    const first=await save(request('/api/save',payload));assert.equal(first.status,200);
    const saved=await first.json();
    const before=(await sql`SELECT updated_at FROM documents WHERE id=${docId}`)[0].updated_at;
    const replay=await save(request('/api/save',payload));assert.equal(replay.status,200);
    assert.deepEqual(await replay.json(),saved);
    assert.deepEqual((await sql`SELECT updated_at FROM documents WHERE id=${docId}`)[0].updated_at,before);
    assert.equal((await save(request('/api/save',{...payload,title:'ID 재사용 변조'}))).status,409);
    await asUser(2);assert.equal((await save(request('/api/save',payload))).status,409);await asUser(1);
    assert.ok(first.headers.get('X-Save-Trace'));
  });

  await t.test('a lost COMMIT response can be retried without creating a duplicate new document', async () => {
    let lose=true;
    const ambiguousSql=(...args)=>sql(...args);
    ambiguousSql.begin=async fn=>{
      const result=await sql.begin(fn);
      if(lose){lose=false;throw Object.assign(new Error('lost COMMIT acknowledgement'),{code:'ECONNRESET'});}
      return result;
    };
    const saveLoad=makeLoader({
      './db':dbModule,'@/wiki/lib/db':{...dbModule,isTransientDbError:e=>e.code==='ECONNRESET'},'@/app/wiki/lib/db':dbModule,
      '@/wiki/lib/saveConnection':{withSaveConnection:fn=>fn(ambiguousSql)},
      '@/wiki/lib/auth':authModule,'@/app/wiki/lib/auth':authModule,
      'next/cache':{unstable_cache:fn=>fn,revalidateTag(){}},'next/server':{...require('next/server'),after(){}},
    })('app/api/save/route.ts').POST;
    const payload={...valid,title:'응답 유실 재시도',saveRequestId:require('node:crypto').randomUUID()};
    const first=await saveLoad(request('/api/save',payload));assert.equal(first.status,503);
    const second=await saveLoad(request('/api/save',payload));assert.equal(second.status,200);
    const third=await saveLoad(request('/api/save',payload));assert.equal(third.status,200);
    assert.deepEqual(await second.json(),await third.json());
    assert.equal((await sql`SELECT count(*)::int AS n FROM documents WHERE title=${payload.title}`)[0].n,1);
    const id=(await sql`SELECT id FROM documents WHERE title=${payload.title}`)[0].id;
    await sql`DELETE FROM document_search_sections WHERE document_id=${id}`;await sql`DELETE FROM document_contents WHERE document_id=${id}`;await sql`DELETE FROM documents WHERE id=${id}`;
  });

  await t.test('a save acquires its own connection while the shared read connection is reserved', async () => {
    const isolatedDb={...dbModule,createSqlConnection:()=>postgres({host:'127.0.0.1',port,database:'postgres',username:'postgres',password:'postgres',prepare:false,max:1,onnotice(){}})};
    const isolatedLoad=makeLoader({
      './db':isolatedDb,'@/wiki/lib/db':isolatedDb,'@/app/wiki/lib/db':isolatedDb,
      '@/wiki/lib/auth':authModule,'@/app/wiki/lib/auth':authModule,
      'next/cache':{unstable_cache:fn=>fn,revalidateTag(){}},'next/server':{...require('next/server'),after(){}},
    });
    const reserved=await sql.reserve();
    try {
      const response=await isolatedLoad('app/api/save/route.ts').POST(request('/api/save',{...valid,id:docId,title:'최신 문서'}));
      assert.equal(response.status,200,await response.clone().text());
    } finally {reserved.release();}
  });

  await t.test('fresh editor loads bypass a stale public document cache', async () => {
    let freshReads = 0; let cachedReads = 0;
    const freshLoad = makeLoader({
      './db': dbModule, '@/wiki/lib/db': dbModule, '@/app/wiki/lib/db': dbModule,
    '@/wiki/lib/saveConnection': { withSaveConnection: fn => fn(sql) },
      '@/wiki/lib/auth': authModule, '@/app/wiki/lib/auth': authModule,
      'next/cache': { unstable_cache: fn => fn, revalidateTag() {} },
      '@/wiki/lib/documentCache': {
        getCachedDocumentById: async id => { cachedReads++; return { id, title: '오래된 문서', updated_at: '2020-01-01', content: [] }; },
        getDocumentByIdFresh: async id => { freshReads++; return { id, title: '최신 문서', updated_at: '2026-11-16', content: valid.content }; },
      },
    });
    const get = freshLoad('app/api/documents/route.ts').GET;
    assert.equal((await (await get(request(`/api/documents?id=${docId}`, undefined, 'GET'))).json()).title, '오래된 문서');
    assert.equal((await (await get(request(`/api/documents?id=${docId}&fresh=1`, undefined, 'GET'))).json()).title, '최신 문서');
    assert.equal(cachedReads, 1); assert.equal(freshReads, 1);
  });

  await t.test('a temporary account lookup failure is unavailable rather than a guest role response', async () => {
    const unavailable = { ...dbModule, sql: () => Promise.reject(Object.assign(new Error('temporary timeout'), { code: 'CONNECT_TIMEOUT' })), isTransientDbError: error => error?.code === 'CONNECT_TIMEOUT' };
    const unavailableLoad = makeLoader({ '@/wiki/lib/db': unavailable, '@/wiki/lib/auth': authModule });
    const response = await unavailableLoad('app/api/auth/me/route.ts').GET(request('/api/auth/me', undefined, 'GET'));
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.degraded, true); assert.equal(payload.role, undefined);
    assert.equal(response.headers.has('Set-Cookie'), false);
  });

  await t.test('search returns indexed and legacy documents with working section anchors', async () => {
    const legacy = await sql`INSERT INTO documents(title,path,tags) VALUES('구형 문서','1','') RETURNING id`;
    await sql`INSERT INTO document_contents(document_id,content) VALUES(${legacy[0].id},${JSON.stringify(valid.content)})`;
    const response = await load('app/api/search/route.ts').GET(request('/api/search?query=고유키워드',undefined,'GET'));
    assert.equal(response.status,200,await response.clone().text());
    const rows = await response.json();
    assert.ok(rows.some((r) => r.id===docId),JSON.stringify(rows));
    assert.ok(rows.some((r) => r.id===legacy[0].id));
    assert.ok(rows.find((r) => r.id===docId).section_dom_id);
  });

  await t.test('server-side deletion ownership matches existing manager controls', async () => {
    await asUser(2);
    for (const route of ['npcs','head','villages']) {
      const response = await load(`app/api/${route}/[id]/route.ts`).DELETE(request(`/api/${route}/1`,undefined,'DELETE'),params(1));
      assert.equal(response.status,403,route);
    }
    assert.equal((await sql`SELECT count(*)::int AS n FROM npc`)[0].n,1);
    await asUser(1);
  });

  await t.test('category descendants cannot become their own ancestors', async () => {
    await sql`INSERT INTO categories(id,name,parent_id) VALUES(2,'하위 분류',1)`;
    const response = await load('app/api/categories/[id]/route.ts').PUT(request('/api/categories/1',{
      name:'상위 분류',parent_id:2,order:0,mode_tags:['rpg'],document_id:null,
    },'PUT'),params(1));
    assert.equal(response.status,400,await response.clone().text());
    assert.equal((await sql`SELECT parent_id FROM categories WHERE id=1`)[0].parent_id,null);
  });

  await t.test('legacy reaction endpoint uses the existing arrays, never the absent chat_reactions table', async () => {
    const message = await sql`INSERT INTO chat_messages(user_id,text) VALUES(1,'검증 채팅') RETURNING id`;
    const response = await load('app/api/chat/reaction/route.ts').POST(request('/api/chat/reaction',{id:message[0].id,type:'like'}));
    assert.equal(response.status,200,await response.clone().text());
    assert.equal((await response.json()).like_count,1);
    const second = await load('app/api/chat/reaction/route.ts').POST(request('/api/chat/reaction',{id:message[0].id,type:'dislike'}));
    const counts=await second.json();assert.equal(counts.like_count,0);assert.equal(counts.dislike_count,1);
  });

  await t.test('a role cookie cannot override a current DB role or a deleted account', async () => {
    await asUser(4);
    const response = await load('app/api/auth/me/route.ts').GET(request('/api/auth/me',undefined,'GET',{Cookie:'rd_role=admin'}));
    assert.equal((await response.json()).role,'guest');
    const missingAuth = { ...user,id:9999 };
    user=missingAuth;
    const missing=await load('app/api/auth/me/route.ts').GET(request('/api/auth/me',undefined,'GET',{Cookie:'rd_role=admin'}));
    assert.equal((await missing.json()).loggedIn,false);
  });

  await t.test('parallel views count once per cooldown and both counters stay consistent', async () => {
    const {recordView}=load('app/wiki/lib/recordView.ts');
    const results=await Promise.all(Array.from({length:8},()=>recordView('document',docId,'visitor-test','search')));
    assert.equal(results.filter((r)=>r.counted).length,1);
    assert.equal(Number((await sql`SELECT views FROM document_stats_total WHERE document_id=${docId}`)[0].views),1);
    assert.equal(Number((await sql`SELECT views FROM document_stats_daily WHERE document_id=${docId}`)[0].views),1);
    await sql`UPDATE document_view_recent SET last_viewed_at=NOW()-INTERVAL '11 minutes' WHERE document_id=${docId}`;
    assert.equal((await recordView('document',docId,'visitor-test','search')).counted,true);
    assert.equal((await recordView('faq',1,'visitor-faq','home')).counted,true);
    assert.equal((await recordView('document',99999,'visitor-invalid','other')).exists,false);
  });

  await t.test('a daily-stat failure cannot partially increment the total or cooldown', async () => {
    const {recordView}=load('app/wiki/lib/recordView.ts');
    const before=Number((await sql`SELECT views FROM document_stats_total WHERE document_id=${docId}`)[0].views);
    await sql`ALTER TABLE document_stats_daily ADD CONSTRAINT reject_stat CHECK(views<3)`;
    await assert.rejects(recordView('document',docId,'visitor-rollback','other'));
    assert.equal(Number((await sql`SELECT views FROM document_stats_total WHERE document_id=${docId}`)[0].views),before);
    assert.equal((await sql`SELECT count(*)::int AS n FROM document_view_recent WHERE visitor_id='visitor-rollback'`)[0].n,0);
    await sql`ALTER TABLE document_stats_daily DROP CONSTRAINT reject_stat`;
  });

  await t.test('partial S3 errors preserve image database references', async () => {
    await asUser(1);
    await sql`INSERT INTO images(id,name,s3_key,uploader,folder_id) VALUES(1,'owned.png','owned-key','Writer',1)`;
    process.env.S3_BUCKET_NAME='isolated-test-bucket';
    let deletes=0;
    const partialLoad=makeLoader({
      './db':dbModule,'@/wiki/lib/db':dbModule,'@/app/wiki/lib/db':dbModule,
      '@/wiki/lib/auth':authModule,'@/app/wiki/lib/auth':authModule,
      'next/cache':{unstable_cache:fn=>fn,revalidateTag(){}},
      '@aws-sdk/client-s3':{S3Client:class{async send(){deletes++;return {Errors:[{Code:'AccessDenied',Key:'owned-key'}]};}},DeleteObjectsCommand:class{}},
    });
    const response=await partialLoad('app/api/image/delete/route.ts').DELETE(request('/api/image/delete',{ids:[1]},'DELETE'));
    assert.equal(response.status,500);assert.equal(deletes,1);
    assert.equal((await sql`SELECT count(*)::int AS n FROM images WHERE id=1`)[0].n,1);
    await asUser(2);
    const forbidden=await partialLoad('app/api/image/delete/route.ts').DELETE(request('/api/image/delete',{ids:[1]},'DELETE'));
    assert.equal(forbidden.status,403);assert.equal(deletes,1);
    await asUser(1);
  });

  await t.test('deleting a document removes derived data and invalidates only its content cache', async () => {
    const {deleteDocumentsUsing}=load('app/wiki/lib/documentMutation.ts');
    await sql`UPDATE categories SET document_id=${docId} WHERE id=1`;
    await sql.begin((tx)=>deleteDocumentsUsing(tx,[docId]));
    for(const table of ['documents','document_contents','document_search_sections']) {
      const column=table==='documents'?'id':'document_id';
      assert.equal((await sql`SELECT count(*)::int AS n FROM ${sql(table)} WHERE ${sql(column)}=${docId}`)[0].n,0);
    }
    assert.equal((await sql`SELECT document_id FROM categories WHERE id=1`)[0].document_id,null);
    assert.ok(invalidations.some((tag)=>tag.endsWith(`:${docId}`)));
  });
  await t.test('category creation validates parents and recursive deletion is atomic', async () => {
    await asUser(3);
    const categories=load('app/api/categories/route.ts');
    assert.equal((await categories.POST(request('/api/categories',{name:'잘못된 부모',parent_id:99999}))).status,400);
    await sql`SELECT setval('categories_id_seq',(SELECT max(id) FROM categories))`;
    const root=await (await categories.POST(request('/api/categories',{name:'삭제 검증 상위',parent_id:null}))).json();
    const child=await (await categories.POST(request('/api/categories',{name:'삭제 검증 하위',parent_id:root.id}))).json();
    assert.ok(root.id);assert.ok(child.id);
    const saved=await (await save(request('/api/save',{...valid,title:'하위 문서',path:String(child.id)}))).json();
    assert.ok(saved.id);
    await sql.unsafe(`CREATE FUNCTION reject_audit_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated delete failure'; END $$; CREATE TRIGGER reject_audit_delete BEFORE DELETE ON documents FOR EACH ROW EXECUTE FUNCTION reject_audit_delete();`);
    const remove=load('app/api/categories/[id]/route.ts').DELETE;
    const delRequest=()=>request(`/api/categories/${root.id}`,undefined,'DELETE',{'x-rd-delete-password':'integration-delete'});
    const failed=await remove(delRequest(),params(root.id));assert.equal(failed.status,500);
    assert.equal((await sql`SELECT count(*)::int AS n FROM categories WHERE id=${child.id}`)[0].n,1);
    assert.equal((await sql`SELECT count(*)::int AS n FROM document_contents WHERE document_id=${saved.id}`)[0].n,1);
    await sql.unsafe('DROP TRIGGER reject_audit_delete ON documents; DROP FUNCTION reject_audit_delete();');
    const removed=await remove(delRequest(),params(root.id));assert.equal(removed.status,200,await removed.clone().text());
    assert.equal((await sql`SELECT count(*)::int AS n FROM categories WHERE id IN (${root.id},${child.id})`)[0].n,0);
    assert.equal((await sql`SELECT count(*)::int AS n FROM documents WHERE id=${saved.id}`)[0].n,0);
  });

  await t.test('proposed hardening blocks both Data API roles while server queries work', async () => {
    await sql.unsafe('CREATE ROLE anon; CREATE ROLE authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;');
    const migration=fs.readFileSync(path.join(__dirname,'../docs/review/database-hardening.proposed.sql'),'utf8');
    await sql.unsafe(migration);
    for(const role of ['anon','authenticated']) {
      await assert.rejects(sql.begin(async(tx)=>{await tx.unsafe(`SET LOCAL ROLE ${role}`);await tx`SELECT id FROM users`;}));
      await assert.rejects(sql.begin(async(tx)=>{await tx.unsafe(`SET LOCAL ROLE ${role}`);await tx`UPDATE documents SET title='unauthorized'`;}));
    }
    assert.equal((await sql`SELECT count(*)::int AS n FROM users`)[0].n,4);
    await sql.unsafe(migration); // review script remains idempotent
  });

});
