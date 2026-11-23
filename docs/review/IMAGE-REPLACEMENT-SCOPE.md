# 이미지 교체 패치 변경 범위 및 후속 수정

2026-11-23, PR #7. 최초 기능 커밋 `cd7ff947915bf43aa9502f1846098f1c3ce80fb8`의 전체 변경을 기준으로 점검했다.

## 확인한 부작용과 원복

| 위치 | 최초 변경 | 확인 결과 | 후속 처리 |
| --- | --- | --- | --- |
| 문서 브레드크럼 | 원래 `img`를 공통 `ManagedImage`로 전환 | styled-jsx의 범위 클래스가 실제 이미지에 붙지 않아 16px 크기 규칙 미적용 | 원래 `img`와 CSS로 복원. 주소 변환만 부모의 resolver 훅으로 유지 |
| 바로가기·즐겨찾기 아이콘 | 같은 공통 이미지 전환 | 같은 이유로 24px 크기 규칙의 적용이 끊기는 사례 확인 | 원래 `img`와 CSS로 복원. 주소 변환만 유지 |
| 홈페이지 정적 이미지 | `next/image`를 `SmartImage`로 변경 | 대상이 로컬 정적 로고·아이콘이어서 이번 관리 이미지 교체에 불필요 | 원래 `next/image`로 되돌림. 기능 추가 전 파일과 동일한 상태 |

범위 지정 CSS와 공통 이미지 컴포넌트의 경계를 충분히 검증하지 못한 것이 원인이었다. 일반 TSX 렌더링 테스트만으로는 해당 크기 스타일 누락을 확인하지 못하므로, 실제 styled-jsx 컴파일러를 사용해 16px·24px 규칙과 범위 클래스가 연결되는 회귀 검사를 추가했다.

최초 공통 이미지 전환 대상 중 범위 지정 `<style jsx>`를 가진 파일을 모두 대조했다. 위 두 곳과 문서 화면 `WikiPageInner`가 해당했다. 문서 제목 아이콘의 크기 규칙은 `style jsx global`에 있어 동일한 범위 클래스 문제에 해당하지 않았다. 다른 대상은 전역 CSS·CSS Modules·인라인 크기를 사용한다. 모든 화면을 실제 브라우저에서 시각 검수했다는 뜻은 아니다.

## 사용자 요청에 따른 모달 수정

- 적용 확인 체크박스와 그에 따른 버튼 잠금을 제거했다. 추가 확인창 없이 파일 선택 후 교체 버튼으로 실행한다.
- 기존 업로드 모달과 같은 520px 폭, 드롭 영역·아이콘·파일 목록·취소/실행 버튼 스타일을 사용한다.
- 기존 업로드 모달 자체의 코드나 동작은 수정하지 않았다.
- 현재·새 이미지 미리보기, 이전 버전 복원, 파일 제한, 권한 검사, 충돌 안내는 유지한다.

## 최초 기능 패치에서 함께 수정한 영역

최초 커밋은 새 파일을 포함해 **51개 파일**을 변경했다. 그중 **29개 기존 파일**의 네이티브 이미지 표시를 공통 이미지 컴포넌트로 바꿨다. 본문 외에 아이콘·검색·NPC·카드·에디터에서도 예전 URL을 최신 파일로 연결하기 위한 변경이었다. 위 브레드크럼·바로가기와 홈의 부작용 또는 불필요 변경은 이번 후속 수정에 반영했다.

| 영역 | 변경 내용과 이유 |
| --- | --- |
| 앱 공통 레이아웃 | 최신 이미지 주소 목록을 공급하는 Provider 추가. 문서마다 본문을 다시 저장하지 않고 표시 단계에서 연결 |
| 이미지 표시 | 본문·인라인·무기/시세 카드·제목/목차/분류·검색·NPC/퀘스트/머리찾기·관리/선택 창에 공통 주소 해석 적용 |
| 이미지 관리 | 우클릭 및 상단 교체 메뉴, 교체·이력·복원 모달 추가 |
| 삭제 API | 이미지/폴더 삭제 시 보관된 이전 버전 파일도 정리 대상으로 포함 |
| 활동 로그 | `image.replace`, `image.restore` 기록과 관리 화면 설명 추가 |
| 신규 API | 이미지 교체·복원·이력 조회와 공개 주소 연결 목록 |
| DB 구조 | `images.revision`, `images.updated_at`, 서버 전용 `image_versions` 테이블·인덱스·직접 접근 차단 |
| 검증 자료 | 격리 DB·가짜 S3 경계 테스트, 모달·주소 연결 테스트, 로컬 HTTP 검증과 문서 |

기존 로그인·인증·문서 저장 API와 문서 본문의 저장 구조는 수정하지 않았다. 최초 DB 구조 준비 때 기존 이미지의 이름·S3 경로·URL·MIME와 문서 본문이 그대로인지 전후 해시를 대조했다. 이번 후속 수정은 코드·테스트·문서 작업이며 운영 DB나 실제 S3 파일을 추가로 변경하지 않았다.

## 최초 변경 파일 전체 목록

아래 목록은 최초 51개 파일을 빠짐없이 기록한다. 후속 원복·수정 상태도 표시한다.

| 파일 | 후속 상태 |
| --- | --- |
| `app/api/image/delete/route.ts` | 최초 기능 변경 유지 |
| `app/api/image/folder/delete/route.ts` | 최초 기능 변경 유지 |
| `app/api/image/replace/route.ts` | 최초 기능 변경 유지 |
| `app/api/image/replacements/route.ts` | 최초 기능 변경 유지 |
| `app/components/common/HamburgerMenu.tsx` | 최초 기능 변경 유지 |
| `app/components/common/ManagedImage.tsx` | 최초 기능 변경 유지 |
| `app/components/common/SearchBox.tsx` | 최초 기능 변경 유지 |
| `app/components/common/SmartImage.tsx` | 최초 기능 변경 유지 |
| `app/components/editor/SlateEditor.tsx` | 최초 기능 변경 유지 |
| `app/components/editor/TableOfContents.tsx` | 최초 기능 변경 유지 |
| `app/components/editor/helpers/WikiDbEmbedIdModal.tsx` | 최초 기능 변경 유지 |
| `app/components/editor/render/weapon/WeaponEditorAdapter.tsx` | 최초 기능 변경 유지 |
| `app/components/home/HomePage.tsx` | 기능 추가 전 상태로 원복 |
| `app/components/image/ImageReplaceModal.module.css` | 추가 확인 제거·업로드 모달 스타일 적용 |
| `app/components/image/ImageReplaceModal.tsx` | 추가 확인 제거·업로드 모달 스타일 적용 |
| `app/components/image/ImageReplacementProvider.tsx` | 네이티브 이미지에서도 사용할 주소 resolver 제공 |
| `app/components/image/ImageSelectModal.tsx` | 최초 기능 변경 유지 |
| `app/components/manager/IconCell.tsx` | 최초 기능 변경 유지 |
| `app/components/manager/PictureGrid.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki-render/blocks/MediaBlock.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki-render/inline/InlineImage.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki-render/link/LinkCardRenderer.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki-render/weapon/WeaponCardRenderer.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki/Breadcrumb.tsx` | 원래 이미지 태그·크기 CSS 복원, URL 연결 유지 |
| `app/components/wiki/CategoryTree.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki/DocQuickBadges.tsx` | 원래 이미지 태그·크기 CSS 복원, URL 연결 유지 |
| `app/components/wiki/HeadDetailModal.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki/HeadGrid.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki/NpcDetailModal.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki/NpcGrid.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki/NpcPictureSlider.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki/TableOfContents.tsx` | 최초 기능 변경 유지 |
| `app/components/wiki/WikiPageInner.tsx` | 최초 기능 변경 유지 |
| `app/layout.tsx` | 최초 기능 변경 유지 |
| `app/manage/category/page.tsx` | 최초 기능 변경 유지 |
| `app/manage/head/page.tsx` | 최초 기능 변경 유지 |
| `app/manage/image/page.tsx` | 최초 기능 변경 유지 |
| `app/manage/logs/page.tsx` | 최초 기능 변경 유지 |
| `app/manage/npc/page.tsx` | 최초 기능 변경 유지 |
| `app/manage/quest/page.tsx` | 최초 기능 변경 유지 |
| `app/wiki/lib/QuestNpcList.tsx` | 최초 기능 변경 유지 |
| `app/wiki/lib/activity.ts` | 최초 기능 변경 유지 |
| `app/wiki/lib/imageReplacementFile.ts` | 최초 기능 변경 유지 |
| `app/wiki/lib/imageReplacementStore.ts` | 최초 기능 변경 유지 |
| `app/wiki/lib/imageReplacements.ts` | 최초 기능 변경 유지 |
| `docs/review/IMAGE-REPLACEMENT.md` | 최초 기능 변경 유지 |
| `scripts/audit-http-smoke.mjs` | 최초 기능 변경 유지 |
| `scripts/local-audit-db.mjs` | 최초 기능 변경 유지 |
| `scripts/setup-image-replacements.mjs` | 최초 기능 변경 유지 |
| `tests/image-replacement-ui.test.cjs` | 확인 없이 교체하는 흐름 검증으로 갱신 |
| `tests/image-replacement.test.cjs` | 최초 기능 변경 유지 |
