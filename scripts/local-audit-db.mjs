// Isolated development fixture. Never loads a hosted DATABASE_URL or user data.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import bcrypt from 'bcryptjs';
import { imageReplacementSchema } from './setup-image-replacements.mjs';
import { documentSaveRequestSchema } from './setup-document-save-requests.mjs';
const db = await PGlite.create({ extensions: { pg_trgm } });
await db.exec(await readFile(new URL('../tests/fixtures/wiki.sql', import.meta.url),'utf8'));
await db.exec(imageReplacementSchema);
await db.exec(documentSaveRequestSchema);
await db.exec(`INSERT INTO images(id,name,folder_id,uploader,mime_type,s3_key,url,revision) VALUES
  (1,'교체 검증 이미지',1,'Writer','image/png','images/1/http-new.png','https://rdwiki.s3.ap-southeast-2.amazonaws.com/images/1/http-new.png',1),
  (2,'다른 작성자 이미지',1,'Other','image/png','images/1/http-other.png','https://rdwiki.s3.ap-southeast-2.amazonaws.com/images/1/http-other.png',0);
  INSERT INTO image_versions(image_id,s3_key,url,mime_type,name) VALUES
  (1,'images/1/http-old.png','https://rdwiki.s3.ap-southeast-2.amazonaws.com/images/1/http-old.png','image/png','이전.png'),
  (1,'images/1/http-new.png','https://rdwiki.s3.ap-southeast-2.amazonaws.com/images/1/http-new.png','image/png','현재.png');`);
await db.query('UPDATE users SET password_hash=$1',[await bcrypt.hash('LocalAudit123!',10)]);
const content=[
  {type:'heading-one',children:[{text:'문서 안내'}]},
  {type:'paragraph',children:[{text:'로컬 검증용 문서입니다. 검색 고유키워드와 편집 저장을 확인합니다.'}]},
  {type:'heading-two',children:[{text:'추가 정보'}]},
  {type:'paragraph',children:[{text:'실제 운영 데이터가 포함되어 있지 않습니다.'}]},
];
for(const [id,title,path] of [[73,'대표 문서','0'],[74,'테스트 문서','1']]){
 await db.query('INSERT INTO documents(id,title,path,tags,uploader,is_featured) VALUES($1,$2,$3,$4,$5,$6)',[id,title,path,'테스트,안내','Writer',id===73]);
 await db.query('INSERT INTO document_contents(document_id,content) VALUES($1,$2)',[id,JSON.stringify(content)]);
}
await db.query("SELECT setval(pg_get_serial_sequence('documents','id'),74)");
const server=new PGLiteSocketServer({db,maxConnections:10,host:'127.0.0.1',port:6543});
await server.start();
console.log('Isolated wiki fixture ready on 127.0.0.1:6543. Local test accounts: writer / other / admin / guest. Password: LocalAudit123!');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.stop();await db.close();process.exit(0)});
