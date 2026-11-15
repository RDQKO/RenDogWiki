// Isolated development fixture. Never loads a hosted DATABASE_URL or user data.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import bcrypt from 'bcryptjs';
const db = await PGlite.create({ extensions: { pg_trgm } });
await db.exec(await readFile(new URL('../tests/fixtures/wiki.sql', import.meta.url),'utf8'));
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
const server=new PGLiteSocketServer({db,host:'127.0.0.1',port:6543});
await server.start();
console.log('Isolated wiki fixture ready on 127.0.0.1:6543. Local test accounts: writer / other / admin / guest. Password: LocalAudit123!');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.stop();await db.close();process.exit(0)});
