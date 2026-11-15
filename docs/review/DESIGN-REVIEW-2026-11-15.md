# 디자인 개선·브라우저 검수 보고 (2026-11-15)

기준 브랜치: `fix/wiki-ui-and-collapsible-2026-11-15` (`9b359e3`)
작업 브랜치: `design/claude-wiki-review-2026-11-15`
main 병합·운영 배포·운영 DB 변경은 하지 않았다. 모든 확인은 `npm run dev:fixture`의 로컬 메모리 DB와
검수용으로 추가한 로컬 문서(표 9열, 무기 15항목, 시세 카드, 중첩 펼침 영역, FAQ 6건)로 했다.

## 1. 변경 요약

| 영역 | 재현 조건·원인 | 변경 | 파일 |
| --- | --- | --- | --- |
| 공통 토큰 | 강조색이 보라(`--accent`)와 초록(홈·분류)으로 섞여 있었고, 열람 화면 링크(보라)와 편집기 링크(초록)가 달랐다 | `--accent`를 초록으로 통일, `--rd-*` 토큰(색·모서리·그림자·포커스 링) 추가, 키보드 `:focus-visible` 표시 | `app/globals.css` |
| 공용 버튼 | `.rd-btn` 기본 정의가 `image.css`·`manage-category.css`·`editor.css`·`Modal.module.css`에 중복. 흰 글자 대비 약 2.9:1, 다크 모드 색 누락 | 단일 정의를 `globals.css`로 이동(대비 4.5:1 이상, 다크 대응, `.sm`, `aria-busy`). 중복 규칙 제거. 모달은 배치만 고정 | `globals.css`, `image.css`, `manage-category.css`, `editor.css`, `Modal.module.css` |
| 문서 3열 배치 | 1440px에서 좌우 24px 거터 띠, 닫힌 모바일 드로어의 그림자가 왼쪽 가장자리로 새어 나옴, 1920px에서 목차 패널이 열 밖으로 나감 | 전체 폭 배치 + 본문 최대 920px, 분류 사이드바 sticky, 드로어 그림자는 열렸을 때만 | `wiki.css` |
| 바로가기 버튼 | 플로팅 바로가기가 분류 패널 위에 겹침 | 사이드바 왼쪽에 버튼 전용 레일 확보 | `wiki.css` |
| 분류 트리 | 행 간격 78px로 밀도가 낮고, 긴 이름이 말줄임만 됨. 문서 항목(`li`)이 키보드로 조작 불가 | 행 높이 축소, 두 줄 줄바꿈 + `title` 전체 이름, 문서 항목에 `role=button`·`tabIndex`·Enter/Space, `aria-current` | `categoryTree.css`, `CategoryTree.tsx`, `CategoryTreeIconStability.module.css` |
| 목차 | 아이콘 없는 제목에도 빈 아이콘 칸이 그려짐, 긴 제목 말줄임 | 빈 칸 제거, 단계별 들여쓰기, 두 줄 줄바꿈. 스크롤·해시 처리 로직은 변경 없음 | `TableOfContents.tsx`, `tableOfContentsHome.css` |
| 문서 제목 | 제목이 칩 모양 상자 안에 있고 모바일에서 말줄임("종합 디자인 검…"). 링크 복사·즐겨찾기 버튼이 hover에서만 보여 터치에서 접근 불가, 이모지 아이콘 | 상자 제거, 줄바꿈, 버튼 상시 표시 + FontAwesome 아이콘 + `aria-pressed`, 죽은 `@import`(Jua 폰트) 제거 | `document-title.css`, `WikiPageInner.tsx` |
| 본문 | 긴 URL이 본문 밖(목차 열)으로 넘침 | `overflow-wrap: anywhere` + `word-break: keep-all` | `wiki.css` |
| 형광펜 | 다크 모드에서 글자색 미지정 형광펜이 밝은 배경 + 흰 글자로 읽을 수 없음 | 배경 휘도에 맞는 글자색을 함께 지정 | `LeafRenderer.tsx` |
| 표 | 9열 표가 균등 폭으로 눌려 글자가 세로로 쪼개짐 | 5열 이상은 내용 기준 열 너비 + 가로 스크롤(4열 이하는 기존 유지) | `table.css` |
| 펼침·접힘 | 회색 기본 모양, 열림/닫힘 구분 약함 | 화살표 회전, 열림 구분선, 중첩 면 구분, 포커스 링, 다크 대응, 편집기 헤더·메뉴 정리. 마크업·동작 변경 없음 | `Collapsible.module.css` |
| FAQ | 긴 질문 말줄임. 관리 메뉴가 우클릭/Shift+F10뿐이라 터치에서 접근 불가 | 제목 줄바꿈, 작성 권한자에게 행 오른쪽 ⋯ 버튼(같은 권한 규칙·같은 메뉴), 메뉴 항목 모양 정리, 모달 글자 9~11px → 11~15px | `FaqList.tsx`, `faq.css`, `wiki-final-polish.css` |
| 헤더(문서) | 640px 이하에서 검색창이 사라지고, 768px 이하에서 메뉴(로그인·마이페이지)가 사라짐. ☰가 분류 열기로만 동작 | 검색 버튼(헤더 아래로 펼침), 분류 버튼, 메뉴 버튼을 모두 제공. 1920px에서 헤더 폭을 본문 배치와 맞춤 | `Header.tsx`, `wikiHeaderHome.module.css` |
| 헤더(홈) | 860px 이하에서 테마 전환·메뉴가 모두 숨겨짐 | 항상 표시 | `HomePage.tsx`, `home.module.css` |
| 검색 결과 창 | 좁은 화면에서 뒤 본문이 비쳐 보임 | 불투명 바탕색, 중첩 `backdrop-filter` 제거 | `searchBox.css` |
| 홈 | 목록 글자 9~12px, 긴 분류 칩이 제목을 밀어냄, 태블릿에서 분류 카드 1열 | 글자 크기 상향, 칩 폭 제한 + `title`, 600~768px 2열 | `home.module.css`, `HomePage.tsx` |
| 편집기 | 도구 모음이 한 줄 고정이라 1440px에서도 뒤쪽 도구(▸ 접기 등)가 잘려 보이지 않음. 390px에서 페이지가 가로로 401px 넘침 | 도구 모음 줄바꿈, 좁은 화면 표 최소 폭 해제, 무기 카드 옆 버튼 줄바꿈 | `editor-toolbar.css`, `editor.css`, `weapon-card.css` |
| 로그인 | 배경이 화면 아래 64px 전에 끊김 | 높이·여백 보정, 버튼 토큰 적용 | `login.css` |
| 이미지 관리 | 1320px 이하에서 머리 영역이 세로로 크게 벌어짐(세로 배치에 `flex-basis: 275px`가 높이로 적용). 제목 "관/리" 끊김 | flex 해제, 어절 단위 줄바꿈 | `image.css` |
| 목차 전환 폭 | 1024px에서 3열이 되어 본문 폭이 336px | 사이드 목차는 1200px 이상에서만, 그 아래는 플로팅 목차 버튼 | `tableOfContentsHome.css`, `TableOfContents.tsx`, `MobileWikiNav.tsx` |

## 2. 확인한 화면 (Chromium, Playwright, 로컬 fixture)

| 화면 | 360 | 390 | 768 | 1024 | 1280 | 1440 | 1920 | 다크 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 홈 | 가로 넘침 없음 | 확인 | 확인 | 넘침 없음 | - | 확인 | - | 390·1440 |
| 일반 문서 | 확인 | 확인 | 확인 | 확인 | 확인 | 확인 | 확인 | 1440 |
| 긴 표(9열) | 확인 | - | - | - | - | 확인 | - | 1440 |
| 무기 15항목·시세 카드 | 확인 | - | - | - | - | 확인 | - | 1440 |
| 펼침 영역(중첩 포함) | - | - | - | - | - | 확인 | - | - |
| FAQ(admin) | - | 확인 | - | - | - | 확인 | - | - |
| 검색 결과 | - | 확인 | - | - | - | 확인(홈) | - | 390 |
| 편집기(writer) | 넘침 없음 | 확인 | - | - | - | 확인 | - | 1440 |
| 로그인 | - | 확인 | - | - | - | 확인 | - | - |
| 이미지 관리(admin) | - | 확인 | - | 확인 | 확인 | 확인 | - | - |
| 관리 접근 안내(비로그인) | - | - | - | - | - | 확인 | - | - |

역할: 비로그인(문서·FAQ·관리 안내), writer(편집기), admin(FAQ 관리 메뉴·삭제 항목, 이미지 관리).

## 3. 자동 검사

| 검사 | 결과 |
| --- | --- |
| `npm test` | 46개 통과 |
| `npm run typecheck` | 통과 |
| `npm run lint` | 오류 0, 경고 88(기존 `<img>`·Hook 경고) |
| `npm run build` | 통과 |
| `npm run test:http` | 34개 통과 |
| `npm audit --audit-level=high` | 취약점 0 |

## 4. 확인하지 못한 것·남은 문제

- 실제 조작 검수 미실시: 표 병합, 서식 포함 복사, 이미지 크기 조절, 임시 저장 복구, 409 저장 충돌 화면,
  펼침 영역 생성·undo/redo(자동 테스트만 통과), 이미지 업로드 창(폴더 선택 전 비활성이라 열지 못함),
  NPC·머리·무기 설정·영상 창. 이번 변경에서 해당 로직은 건드리지 않았다.
- S3·SMTP·Ably 실연동, Vercel Preview, Safari/Firefox/실기기 터치는 확인하지 않았다.
- 일반 사용자(guest 계정 로그인) 화면, 회원가입·마이페이지·퀘스트·NPC·머리 관리 화면은 넘침 여부 외 세부 검수를 하지 않았다.
- 무기 카드는 15항목이 모두 표시되고 읽히는 것만 확인했다. 카드 자체 디자인은 변경하지 않았다(15항목이면 카드가 길다).
- 개발 모드 콘솔의 React `key` 경고(`WikiReadRenderer` 하위)는 기존 문제이며 수정하지 않았다.
- 사용되지 않는 `wikiChromeRefresh.css`(어디서도 import하지 않음), `HamburgerMenu.css`/`hamburgerMenu.module.css`
  대소문자 중복 등 CSS 구조 정리는 하지 않았다.
- 성능 수치는 측정하지 않았다.
