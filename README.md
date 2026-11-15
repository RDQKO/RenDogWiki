# RenDogWiki

마인크래프트 렌독 서버의 콘텐츠·시스템·아이템 정보를 제공하는 비공식 위키입니다.

- 사이트: https://ren-dog-wiki.vercel.app
- 저장소: https://github.com/RDQKO/RenDogWiki

## 주요 기능

문서·태그·목차 검색, 카테고리 탐색, 문서 즐겨찾기, FAQ, NPC·퀘스트·머리찾기 정보, 시세표·무기 카드, Slate 문서 편집, 이미지·영상 관리, 실시간 채팅, 조회·검색 통계를 제공합니다. 관리 작업은 서버에서 `writer` 또는 `admin` 권한을 확인합니다.

## 기술 구성

Next.js 15 App Router, React 18, TypeScript, Tailwind CSS, Slate를 사용합니다. Supabase PostgreSQL에는 서버의 `postgres.js`로 연결하며, 로그인은 자체 JWT 쿠키 방식입니다. 파일은 S3/CloudFront, 채팅은 Ably, 인증 메일은 SMTP를 사용합니다.

## 실행

Node.js 22 이상이 필요합니다.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

`.env.local`에 실제 환경 값을 설정합니다. DB 비밀번호, `JWT_SECRET`, AWS·Ably·SMTP 키는 브라우저 코드나 Git에 넣지 않습니다. 운영 DB 연결에는 SSL이 적용됩니다. `MANAGE_DELETE_PASSWORD`가 없으면 추가 비밀번호가 필요한 삭제 API는 503을 반환합니다.

일부 환경에서 네트워크 인터페이스 탐색이 제한되면 `npm run dev -- -H 127.0.0.1`로 실행합니다.

## 검증

```bash
npm test
npm run lint
npm run build
npm run typecheck
npm run test:http
npm audit
```

`npm test`는 메모리의 PostgreSQL(PGlite)에서 실제 SQL과 트랜잭션을 검증합니다. 운영 DB에 쓰지 않습니다. `npm run test:http`는 빌드된 Next.js 서버와 테스트 DB를 직접 실행해 로그인·검색·저장·충돌·조회·채팅·권한 검사를 확인합니다. 3100·6543 포트를 사용하고 종료 시 두 프로세스를 정리합니다. 테스트 계정은 로컬 fixture 전용입니다.

`npm run lint`에는 기존 이미지·Hook 관련 경고가 남아 있습니다. 현재 빌드 설정은 lint를 생략하므로 CI가 lint를 별도로 실행합니다. 브라우저에서 에디터 입력·드래그·모바일 동작과 S3/SMTP/Ably 실제 연동도 별도로 확인해야 합니다.

## 로컬 테스트 DB

```bash
npm run dev:fixture
```

다른 터미널에서 `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:6543/postgres`, `DB_SSL=disable`, 별도의 로컬 `JWT_SECRET`을 설정하고 앱을 실행합니다. 메모리 DB이며 종료하면 초기화됩니다. 로컬 계정과 비밀번호는 실행 로그에 표시됩니다. 실제 사용자의 데이터나 운영 비밀키는 사용하지 않습니다.

## 디렉터리

| 경로 | 역할 |
| --- | --- |
| `app/api` | 인증, 문서·분류, 미디어, FAQ, 채팅·통계 API |
| `app/components/editor` | 문서 편집기와 커스텀 블록 |
| `app/components/wiki-render` | 편집·열람 화면이 공유하는 문서 표현 |
| `app/wiki/lib` | DB·권한·캐시·검색·렌더링 공통 로직 |
| `app/manage` | 카테고리·NPC·퀘스트·머리·미디어·로그 관리 화면 |
| `tests` | 입력·JWT·캐시 회귀 테스트와 격리 DB 통합 검증 |
| `scripts` | 로컬 fixture와 실제 HTTP 검증 실행 |
| `docs/review` | 전체 점검 결과, 디자인 인계, 검토용 DB SQL |

## DB 변경 검토

`docs/review/*.proposed.sql`은 운영 DB에 적용하지 않은 검토안입니다. 배포나 CI가 실행하지 않습니다. 현재 서버 전용 인증 구조를 기준으로 작성했으므로, 다른 앱이 Supabase Data API를 사용하는지 먼저 확인하고 스키마·권한 백업과 스테이징 검증 후 별도로 적용합니다. 검색 인덱스 전체 재구축은 관리자 전용 `/api/search/reindex`를 ID 커서 방식으로 나눠 호출할 수 있습니다.

변경 검토와 인계 내용은 [전체 점검 보고서](docs/review/AUDIT-2026-11-15.md), [클로드 디자인 인계](docs/review/CLAUDE-DESIGN-HANDOFF.md)를 참고하세요.
