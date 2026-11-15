# 클로드 디자인 작업 인계

대상 저장소: https://github.com/RDQKO/RenDogWiki  
기술 개선 브랜치: `audit/full-review-2026-11-15`  
기준 main: `b5b43ff4fc64d7ed696cc65cc9890834f1a86e94`  
요청: 디자인 관련 개선만 담당하고, 완료 후 검수 결과를 보고할 것. main에는 직접 합치지 말 것.

## 작업 전제

이번 기술 점검에서 권한·문서 저장 트랜잭션·수정 충돌·검색·캐시·조회 집계·의존성을 수정했다. 디자인 작업은 해당 브랜치의 최종 커밋을 기준으로 새 디자인 브랜치를 만들어 진행한다. 현재 브랜치에는 새 디자인이나 CSS 재설계를 반영하지 않았다.

이 문서는 인계 준비물이다. Claude에 직접 전송하거나 Claude 작업을 실행한 기록은 아니다.

## 실제로 확인한 공개 화면

2026-11-15 데스크톱 브라우저에서 다음 흐름을 확인했다.

- 홈의 시작 가이드·대표 카테고리·FAQ·최근 수정·인기 문서가 표시됨.
- 홈 검색창에 `초보자` 입력 후 문서 결과와 문단 정보가 표시됨.
- `위키의 이용 방법을 알고싶어요` 결과를 선택하자 문서와 `홈페이지 활용하기` 제목 앵커로 이동함.
- 문서 화면의 좌측 분류, 본문, 우측 목차가 함께 표시됨.
- 확인한 화면 너비는 약 1363px이다. 모바일·다크 모드·새 기술 브랜치의 에디터 브라우저 동작은 확인 완료로 간주하지 않는다.

## 우선 검토할 디자인 항목

| 우선 | 영역 | 요청·검수 기준 |
| --- | --- | --- |
| 1 | 문서 3열 화면 | 1280/1440/1920px에서 본문 폭·줄 길이, 분류·목차의 폭과 위치를 비교. 본문 가독성을 우선하되 목차 앵커 이동을 보존 |
| 1 | 모바일 | 360/390/768px에서 메뉴·목차 열림/닫힘, 가로 표·긴 링크·무기·시세 카드의 넘침·터치 영역을 확인 |
| 1 | 검색 결과 | 문서/목차/FAQ/퀘스트를 시각적으로 구분하고 키보드 포커스·선택·로딩·빈 결과·오류 상태를 확인. 결과 순위와 API 계약은 유지 |
| 1 | 편집 상태 | 저장 중 disabled/aria-busy, 409 충돌, 로딩 실패, 임시 저장 복구 안내를 명확하게 표현. 저장 성공/실패를 시각적으로 혼동시키지 않음 |
| 2 | 분류·목차 | 긴 제목이 잘릴 때 전체 제목을 확인할 수 있게 하고, 선택 상태·현재 읽는 제목·포커스 상태를 구분 |
| 2 | 바로가기 | 플로팅 바로가기 버튼과 좌측 분류 영역의 간격·겹침을 화면 크기별로 검토 |
| 2 | 홈 | 큰 배경·히어로 이미지의 파일 크기와 가독성·대비를 함께 확인. 세 목록의 정보 밀도와 긴 제목 줄바꿈을 통일 |
| 2 | 관리 화면 | NPC·퀘스트·머리·이미지 관리의 선택/편집/저장/삭제 상태와 모달 간격을 일관되게 정리 |
| 2 | 테마·접근성 | 라이트/다크 대비, 키보드 focus-visible, 아이콘 버튼 이름, 모달 포커스·ESC·배경 스크롤을 검수 |
| 3 | CSS 구조 | 전역 CSS 중복·후행 덮어쓰기와 파일명 대소문자 중복을 정리하되 한 번에 전체 스타일을 갈아엎지 않음 |

이는 작업 후보와 검수 기준이다. 모바일 깨짐이나 대비 오류가 이미 재현됐다는 뜻은 아니다. 실제 재현 후 수정 범위를 정할 것.

## 주요 파일

| 화면 | 파일 |
| --- | --- |
| 홈 | `app/components/home/HomePage.tsx`, `home.module.css`, `homeDarkBackgrounds.module.css` |
| 헤더·검색·메뉴 | `app/components/common/Header.tsx`, `SearchBox.tsx`, `HamburgerMenu.tsx`, `app/wiki/css/header.css`, `searchBox.css` |
| 분류·목차·문서 레이아웃 | `app/components/wiki/CategoryTree.tsx`, `TableOfContents.tsx`, `WikiPageInner.tsx`, `app/wiki/css/wiki.css`, `wikiChromeRefresh.css`, `wiki-final-polish.css` |
| 관리 화면 | `app/manage/*/page.tsx`, `app/components/manager`, `app/wiki/css/manager-common.css`와 각 관리자 CSS |
| 에디터 | `app/components/editor/SlateEditor.tsx`, `Toolbar.tsx`, `app/wiki/css/editor.css`, `editor-toolbar.css` |
| 문서 공통 표현 | `app/components/wiki-render`, `app/wiki/css/document-components` |
| 회원 화면 | `app/login`, `app/register`, `app/mypage`, 해당 CSS |

## 기술 변경 중 보존해야 할 것

- `/api/save`의 `expectedUpdatedAt`, 응답 `id`·`updatedAt`, 409 충돌 처리.
- `saving`/중복 클릭 방지, 로드 실패 시 본문을 빈 값으로 저장하지 않는 처리.
- 대표 문서 연결 시 기존 `mode_tags` 등 분류 속성 유지.
- 권한 검사를 프런트 버튼 표시만으로 대체하지 않기. 서버의 writer/admin·업로더 검사는 유지.
- 문서별 캐시 태그·검색 결과의 `section_dom_id`·목차 DOM ID 규칙.
- 새 Ably 토큰은 subscribe 전용. 브라우저 직접 publish 방식으로 되돌리지 않기.
- 브라우저 저장 공간 오류에 대한 fallback과 편집 임시 저장 보존.
- Next 15의 비동기 cookies/params 처리와 React/Slate 의존성 잠금 파일.
- 디자인 검증용으로 운영 문서·미디어를 생성/수정/삭제하지 않기. `npm run dev:fixture`의 로컬 데이터로 확인.

## 완료 보고 조건

1. 각 변경의 재현 조건·이전/이후 화면·변경 파일을 적는다.
2. 홈, 검색 결과, 일반 문서, 긴 표, 무기·시세 카드, 편집기, 이미지 관리, 로그인 화면을 데스크톱/모바일·라이트/다크로 검수한다.
3. 표 병합·텍스트 복사·이미지 크기·임시 저장·저장 충돌 등 실제 조작을 확인한다.
4. `npm test`, `npm run lint`, `npm run build`, `npm run typecheck`, `npm run test:http`를 실행한다.
5. 성능 수치를 주장하면 실제 측정 조건을 함께 적는다.
6. 별도 브랜치/검토용 PR로 제출하고 main 병합과 운영 배포는 하지 않는다.
