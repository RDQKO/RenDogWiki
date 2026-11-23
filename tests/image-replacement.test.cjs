const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const postgres = require('postgres');
const sharp = require('sharp');
const { NextRequest } = require('next/server');
const { makeLoader } = require('./helpers/load-ts.cjs');

test('image replacement: isolated PostgreSQL and S3 contract', async t => {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(fs.readFileSync('tests/fixtures/wiki.sql', 'utf8'));
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  const { imageReplacementSchema } = await import('../scripts/setup-image-replacements.mjs');
  await db.exec(imageReplacementSchema); await db.exec(imageReplacementSchema);
  const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
  await server.start();
  const sql = postgres({ host: '127.0.0.1', port: server.server.address().port, database: 'postgres', username: 'postgres', password: 'postgres', prepare: false, max: 1, onnotice() {} });
  t.after(async () => { await sql.end(); await server.stop(); await db.close(); });
  const s3Calls = [], invalidations = [];
  let user = null, failUpload = false, loseCommitResponse = false;
  class PutObjectCommand { constructor(input) { this.input = input; this.kind = 'put'; } }
  class DeleteObjectCommand { constructor(input) { this.input = input; this.kind = 'delete'; } }
  class DeleteObjectsCommand { constructor(input) { this.input = input; this.kind = 'delete-many'; } }
  const dbModule = { sql, runDbRead: (_label, fn) => fn(), withTx: async fn => {
    const value = await sql.begin(tx => fn(tx));
    if (loseCommitResponse) { loseCommitResponse = false; throw new Error('simulated lost COMMIT response'); }
    return value;
  } };
  const load = makeLoader({ './db': dbModule, '@/wiki/lib/db': dbModule, '@/app/wiki/lib/db': dbModule,
    '@/wiki/lib/auth': { getAuthUser: async () => user }, '@/app/wiki/lib/auth': { getAuthUser: async () => user },
    'next/cache': { unstable_cache: fn => fn, revalidateTag: tag => invalidations.push(tag) },
    '@aws-sdk/client-s3': { PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, S3Client: class {
      async send(command) { s3Calls.push(command); if (failUpload && command.kind === 'put') throw new Error('simulated upload failure'); return {}; }
    } },
  });
  process.env.S3_BUCKET_NAME = 'rdwiki'; process.env.AWS_REGION = 'ap-southeast-2';
  const route = load('app/api/image/replace/route.ts');
  const store = load('app/wiki/lib/imageReplacementStore.ts');
  const { resolveImageReplacement } = load('app/wiki/lib/imageReplacements.ts');
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#00ff00' } }).png().toBuffer();
  const original = 'https://rdwiki.s3.ap-southeast-2.amazonaws.com/images/1/original.png';
  const content = JSON.stringify([{ type: 'image', url: original, width: 650, height: 367, textAlign: 'right', children: [{ text: '' }] }]);
  await sql`INSERT INTO images(id,name,url,s3_key,folder_id,uploader,mime_type) VALUES(1,'그림',${original},'images/1/original.png',1,'Writer','image/png')`;
  await sql`INSERT INTO document_contents(document_id,content) VALUES(123,${content})`;
  const as = async id => { user = id ? (await sql`SELECT * FROM users WHERE id = ${id}`)[0] : null; };
  const current = async id => (await sql`SELECT * FROM images WHERE id=${id}`)[0];
  const post = (id, revision, file = new File([png], '교체.png', { type: 'image/png' })) => {
    const form = new FormData(); form.set('id', String(id)); form.set('expectedRevision', String(revision)); form.set('file', file);
    return route.POST(new NextRequest('http://localhost/api/image/replace', { method: 'POST', body: form }));
  };
  const restore = (id, revision, versionId) => route.PATCH(new NextRequest('http://localhost/api/image/replace', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, expectedRevision: revision, versionId }),
  }));

  await t.test('anonymous, guest and another writer cannot upload or restore', async () => {
    for (const [id, status] of [[null,401],[4,403],[2,403]]) {
      await as(id); assert.equal((await post(1,0)).status,status); assert.equal((await restore(1,0,1)).status,status);
    }
    assert.equal(s3Calls.length,0); assert.equal((await current(1)).url,original);
  });
  await as(1);
  await t.test('validated file replaces the same image record and leaves document formatting untouched', async () => {
    const response = await post(1,0); assert.equal(response.status,200,await response.clone().text());
    const image = (await response.json()).image;
    assert.equal(image.id,1); assert.equal(image.name,'그림'); assert.equal(image.uploader,'Writer'); assert.equal(image.folder_id,1); assert.equal(image.revision,1);
    assert.notEqual(image.url,original); assert.match(image.s3_key,/^images\/1\/.+\.png$/);
    assert.equal(s3Calls.filter(c=>c.kind==='delete').length,0);
    assert.equal((await sql`SELECT content FROM document_contents WHERE document_id=123`)[0].content,content);
    const aliases=await store.readImageAliases();
    assert.equal(resolveImageReplacement(original,aliases),image.url);
    assert.equal(resolveImageReplacement('https://d1y7k8qotewoph.cloudfront.net/images/1/original.png?v=old',aliases),image.url);
    assert.ok(invalidations.includes(store.IMAGE_REPLACEMENTS_TAG));
  });
  await t.test('a second replacement maps every historical URL directly to the latest file', async () => {
    const before=await current(1); assert.equal((await post(1,1)).status,200);
    const image=await current(1),aliases=await store.readImageAliases();
    assert.equal(resolveImageReplacement(original,aliases),image.url);
    assert.equal(resolveImageReplacement(before.url,aliases),image.url);
    assert.equal((await sql`SELECT count(*)::int AS n FROM image_versions WHERE image_id=1`)[0].n,3);
  });
  await t.test('restoring an old file keeps newer history and protects against stale edits after A-B-A', async () => {
    const old=(await sql`SELECT id FROM image_versions WHERE image_id=1 AND s3_key='images/1/original.png'`)[0];
    const before=await current(1); assert.equal((await restore(1,2,old.id)).status,200);
    assert.equal((await current(1)).url,original); assert.equal((await current(1)).revision,3);
    assert.equal(resolveImageReplacement(before.url,await store.readImageAliases()),original);
    assert.equal((await post(1,0)).status,409);
    assert.equal((await restore(1,3,999999)).status,404);
  });
  await t.test('invalid file content and missing revision cannot reach S3', async () => {
    const calls=s3Calls.length;
    assert.equal((await post(1,3,new File(['not an image'],'fake.png',{type:'image/png'}))).status,400);
    assert.equal((await post(1,'')).status,400);
    assert.equal((await post(1,3,new File([new Uint8Array(4*1024*1024)],'large.png',{type:'image/png'}))).status,400);
    assert.equal(s3Calls.length,calls);
  });
  await t.test('failed S3 upload preserves the current image', async () => {
    failUpload=true; const before=await current(1);
    try { assert.equal((await post(1,3)).status,503); } finally { failUpload=false; }
    assert.equal((await current(1)).url,before.url); assert.equal((await current(1)).revision,3);
  });
  await t.test('database failure rolls back history and cleans up only the unreferenced new object', async () => {
    await sql.unsafe("CREATE FUNCTION reject_image_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$; CREATE TRIGGER reject_image_update BEFORE UPDATE ON images FOR EACH ROW EXECUTE FUNCTION reject_image_update();");
    const history=(await sql`SELECT count(*)::int AS n FROM image_versions`)[0].n;
    const deletes=s3Calls.filter(c=>c.kind==='delete').length;
    try { assert.equal((await post(1,3)).status,503); } finally { await sql.unsafe('DROP TRIGGER reject_image_update ON images; DROP FUNCTION reject_image_update();'); }
    assert.equal((await current(1)).url,original); assert.equal((await current(1)).revision,3);
    assert.equal((await sql`SELECT count(*)::int AS n FROM image_versions`)[0].n,history);
    assert.equal(s3Calls.filter(c=>c.kind==='delete').length,deletes+1);
  });
  await t.test('lost commit acknowledgement never deletes the committed replacement', async () => {
    loseCommitResponse=true; const deletes=s3Calls.filter(c=>c.kind==='delete').length;
    const response=await post(1,3); assert.equal(response.status,200,await response.clone().text());
    assert.equal((await current(1)).revision,4); assert.equal(s3Calls.filter(c=>c.kind==='delete').length,deletes);
  });
  await t.test('concurrent replacements have one winner and return a conflict for the stale upload', async () => {
    const responses=await Promise.all([post(1,4),post(1,4)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]); assert.equal((await current(1)).revision,5);
  });
  await t.test('history is private to the server and aliases cannot resolve arbitrary hosts', async () => {
    for(const role of ['anon','authenticated']) await assert.rejects(sql.begin(async tx=>{
      await tx.unsafe(`SET LOCAL ROLE ${role}`); await tx`SELECT id FROM image_versions`;
    }));
    const aliases=await store.readImageAliases();
    const external='https://example.com/images/1/original.png';assert.equal(resolveImageReplacement(external,aliases),external);
    assert.equal(resolveImageReplacement(original,{'images/1/original.png':'https://example.com/attack.png'}),original);
    assert.equal(resolveImageReplacement('/images/local-logo.png',aliases),'/images/local-logo.png');
  });
  await t.test('administrator may replace another uploader and deleting an image also removes retained files', async () => {
    await as(3); assert.equal((await post(1,5)).status,200);
    const files=await store.selectImageFiles([1]);assert.ok(files.length>=5);
    const response=await load('app/api/image/delete/route.ts').DELETE(new NextRequest('http://localhost/api/image/delete',{
      method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[1]}),
    }));assert.equal(response.status,200,await response.clone().text());
    const call=s3Calls.filter(c=>c.kind==='delete-many').at(-1);
    assert.deepEqual(call.input.Delete.Objects.map(x=>x.Key).sort(),files.map(x=>x.s3_key).sort());
    assert.equal((await sql`SELECT count(*)::int AS n FROM image_versions WHERE image_id=1`)[0].n,0);
    assert.equal(Object.keys(await store.readImageAliases()).length,0);
  });
});
