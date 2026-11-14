# 원본 Pull Request 기록

원본 저장소의 병합된 Pull Request 6건을 보존한 기록입니다. GitHub 원본 페이지는 각 제목에서 열 수 있으며, 원본 API 응답과 리뷰 데이터는 [original-pull-requests.json](original-pull-requests.json)에 보관했습니다. 확인 당시 일반 댓글, 리뷰 댓글과 제출된 리뷰는 없었습니다. 원본 PR의 커밋은 이 저장소의 Git 기록에도 포함되어 있습니다.

## [#1 feat(ui): 결과 창 버그 수정, 출처 표시 basis 기준 적용, 문서·발표 자료 갱신](https://github.com/rkddlsxo/kirothon-team-005/pull/1)

- 작성자: @guswl03
- 원본 브랜치: `feat/ui` (`6553530c1d6f92c3b946714b7aedfa3faaaadf66`)
- 병합 커밋: `1b3ab1c2a12908b81acba36a788804f3f38d5fa2`
- 생성: 2026-11-14T05:11:15Z · 병합: 2026-11-14T05:12:02Z
- 일반 댓글: 0개 · 리뷰 댓글: 0개

### 원본 설명

## 요약
C(UI·문서·발표) 작업입니다. 결과 창 버그 5개를 고치고, B의 AI·검색 보강(`dad4c8d`)을 합친 뒤 출처 표시와 문서·발표 자료를 맞췄습니다.

## 변경 내용

### 결과 창 (`src/renderer/`)
- 검색 자료가 부족하거나 검색이 실패했다는 안내가 결과가 뜨면 사라지던 문제 수정
- "다시 만들기" 진행 표시 추가. 해당 항목 버튼만 "만드는 중…"으로 잠그고 중복 요청을 막음
- 후속 질문 중복 요청 방지 (Enter 연타, 버튼 연타, 한글 입력 조합 중 Enter)
- 후속 질문 입력 오류를 상단이 아니라 후속 질문 칸에 표시
- 후속 질문 답변 영역에 "null" 글자가 끼던 문제 수정
- 문장 출처 표시를 `basis: 'sourced'`인 문장에만 붙임 (B의 출처 내용 검증 반영, `.kiro/steering/renderer.md` 규칙)
- DOM과 무관한 판단 로직을 `view.js`로 분리하고 Node 테스트 추가

### 테스트
- `test/renderer/view.test.js` 추가 (12개)
- `test/core/service.test.js`에 이벤트 계약 테스트 5개 추가. `service.js` 코드는 바꾸지 않음

### 문서·발표
- README: `kiro-cli login` 지원, 자동 선택 조건, 재검색·출처 검증 설명, 테스트 수 갱신
- BUILD_REPORT: Kiro 개발 도구, 품질 개선 명세, Kiro 실측(3/6회), 검증 결과, 미검증 항목 갱신
- 발표 자료: Kiro 활용 표와 검증 수치 갱신, 새 스크린샷으로 PDF 재생성
- CODEOWNERS: `/test/renderer/ @C` 추가

## B 확인 요청 (이벤트 계약)
화면이 아래 두 형식에 기대고 있고, 계약 테스트로 고정했습니다. 바꿀 일이 있으면 먼저 알려 주세요.
1. `regenerate`는 `regenerating` 다음에 `regenerated`를 보내고, 두 이벤트의 `kind`, `index`, `requestId`가 같다. 재생성 중에 새 분석이 시작되면 이전 `regenerated`는 보내지 않는다.
2. 후속 질문 입력 오류의 `invalid` 이벤트에는 `scope: 'followup'`이 붙는다. 메인 입력 오류에는 `scope`가 없다.

## 검증
- `node --test "test/**/*.test.js"`: 107/107 통과
- `node scripts/check.js`: 통과
- `node scripts/smoke.js`: `"ok": true`
  - 결과: 문장 6, 질문 5, 화제 전환 3, 출처 3
  - 이벤트 순서: `start, stage:searching, sources, stage:generating, result, stage:done`

## 미검증
- `npm start`로 실제 창에서 직접 눌러 보는 확인: 다시 만들기 연타, 후속 질문 Enter 연타, 빈 후속 질문 안내. 지금까지는 임시 테스트 하네스로만 확인했습니다.
- 시연 영상 링크 (README Demo 줄)

## 리뷰 포인트
- @B: 위 이벤트 계약 두 가지, README의 Kiro CLI 설명이 실제 동작과 맞는지
- @A: README의 "자동 선택은 `KIRO_API_KEY`가 있을 때만 Kiro 선택" 설명이 `main.js` 동작과 맞는지


## [#2 feat(ui): 아는척으로 이름 변경, Kiro 테마·눈 아이콘, Enter 분석, 창 고정 해제](https://github.com/rkddlsxo/kirothon-team-005/pull/2)

- 작성자: @guswl03
- 원본 브랜치: `feat/ui` (`90ee28d5537364763c09050db3fb79d844887a54`)
- 병합 커밋: `396c3ca4392e82afa71b91a6ac64333523d4662e`
- 생성: 2026-11-14T06:53:27Z · 병합: 2026-11-14T06:53:52Z
- 일반 댓글: 0개 · 리뷰 댓글: 0개

### 원본 설명

## 요약
C(UI·문서·발표) 작업입니다. 앱 이름을 **아는척**으로 바꾸고 결과 창을 Kiro 느낌으로 다시 디자인했습니다. 최신 `main`(`789a6ae`, A·B 변경 포함)을 합친 상태입니다.

## 변경 내용
- 이름: "대화 치트키" → "아는척" (창 제목, 트레이, `productName`, README, 발표 자료)
- 디자인: Kiro IDE 다크 테마 색(`#19161d` 배경, `#b080ff` 강조, `#7138cc` 버튼)
- 아이콘: Kiro 보라 둥근 사각형 + 곁눈질하는 눈 (`src/renderer/icon.svg` 원본, 창·트레이 PNG는 `src/main/icon.js`가 같은 도형으로 생성, `docs/assets/icon.svg`·`icon.png`)
- 입력 칸 **Enter로 바로 분석** (Shift+Enter 줄바꿈, 한글 조합 중 Enter 무시, 분석 중 중복 요청 방지) + `view.isSubmitKey` 테스트
- 창 **항상 위 고정 해제**: 다른 창을 누르면 그 창이 앞으로 옴. 자동 분석으로 뜰 때만 한 번 앞으로
- 스크린샷, 발표 PDF, BUILD_REPORT 수치 갱신

## A 확인 요청 (A 소유 파일 수정)
- `src/main/main.js`: `alwaysOnTop: false`, 창 제목·트레이 이름, 자동 분석 시 한 번만 앞으로 올리기, 아이콘 256px
- `src/main/icon.js`: 새 눈 아이콘 그리기
- `package.json`(공유): `productName`, 빌드 아이콘 경로. npm `name`은 설정 저장 위치가 바뀌지 않게 그대로 둠

## 검증
- `node --test "test/**/*.test.js"`: 141/141 통과
- `node scripts/check.js`: 통과
- `node scripts/smoke.js`: `"ok": true`

## 미검증
- `npm start`로 직접 확인: 다른 창 클릭 시 뒤로 가는지, 자동 분석 팝업 동작, Enter 분석


## [#3 feat(ui): 바로 쓸 문장 먼저 표시, 진행 문구 개선, 드래그하면 뜻 먼저 보기](https://github.com/rkddlsxo/kirothon-team-005/pull/3)

- 작성자: @guswl03
- 원본 브랜치: `feat/ui` (`6f1091c06bb57730dfa8bd1bac1132a3c3dafd2d`)
- 병합 커밋: `ac490d4d2567be98d10be407586acff5968ac3fa`
- 생성: 2026-11-14T07:38:39Z · 병합: 2026-11-14T07:38:53Z
- 일반 댓글: 0개 · 리뷰 댓글: 0개

### 원본 설명

- 결과 순서: 지금 바로 쓸 문장 -> 이 말 무슨 뜻이에요?
- 진행 문구: "어떤 얘기인지 찾아보는 중…", "Kiro가 자연스럽게 꺼낼 말을 고르는 중…" (view.stageMessage)
- 설정 "드래그하면 뜻 먼저 보기"(기본 켜짐, localStorage): 검색 결과가 오면 AI 생성 전에 첫 출처의 뜻을 1~2문장으로 먼저 표시 (view.quickMeaning)
- 입력 영역 label 규칙이 스위치 모양을 덮던 CSS 수정
- 테스트 4개 추가

## [#4 feat(desktop): 카카오톡·디스코드 드래그 감지와 메신저 드래그 복사 옵션](https://github.com/rkddlsxo/kirothon-team-005/pull/4)

- 작성자: @yunttai
- 원본 브랜치: `feat/messenger-drag` (`697d2bb7b145928e2926e6a6793cc10f96d7e400`)
- 병합 커밋: `6567a578e7b788ba7ea830376e1426b6f6db0924`
- 생성: 2026-11-14T07:54:38Z · 병합: 2026-11-14T07:54:44Z
- 일반 댓글: 0개 · 리뷰 댓글: 0개

### 원본 설명

## 요약
카카오톡·디스코드 대화 말풍선을 드래그하면 결과 창이 뜨도록 선택 감지를 보강했습니다. (A, 데스크톱 통합)

## 변경
- 감지 순서: 포커스된 컨트롤 -> (드래그 끝) 커서 아래 요소와 상위 10단계(UI Automation) -> (옵션) 메신저 드래그 복사
- 메신저 드래그 복사(`copyFallback`, 기본 꺼짐): UI Automation이 실패한 드래그가 카카오톡·디스코드에서 끝나면 Ctrl+C를 한 번 보내 읽고 원래 클립보드로 되돌림
  - 허용 목록 앱, 드래그 종료 때만, 전면 창 일치, 수정키 미입력, 비밀번호란 제외, 되돌릴 수 없는 클립보드 형식이면 건너뜀
  - 켤 때 동의 창. 자동 분석을 켤 때 함께 묻고 '다시 묻지 않기'(`copyFallbackNoAsk`) 지원. 트레이 메뉴에서도 켜고 끔
- 헬퍼와 측정 도구에 DPI 인식(배율 125% 이상 좌표 어긋남 수정)
- `npm run compat`: 커서 아래 요소 판정, "지원(커서 아래)", "복사 옵션 필요" 상태 추가
- `scripts/check.js`: 키 입력·클립보드 읽기가 정해진 함수 안에서 허용 확인 뒤에만 일어나는지 검사

## 공유 영역 변경 (확인 부탁)
- 저장 설정에 `copyFallback`, `copyFallbackNoAsk` 추가: `.kiro/steering/security.md`, `.kiro/specs/conversation-cheatsheet/design.md`
- `docs/SECURITY_REVIEW.md`에 메신저 드래그 복사 검토 추가

## 검증
- `node --test "test/**/*.test.js"` 152개 통과, `node scripts/check.js` 통과, `node scripts/smoke.js` 통과
- `check.js` 위반 6종을 넣어 모두 탐지 확인, 클립보드 백업·복원 5가지 경우 실제 실행 확인
- 실기기(사용자): 카카오톡 말풍선 판정 "복사 옵션 필요" -> 옵션 켜고 드래그 동작 확인, 디스코드 드래그 동작 확인, 메모장·터미널에서 Ctrl+C 미전송 확인
- 미확인: 클립보드 복원(실기기), Shift 드래그, 입력란 보호, 지연 시간 (`docs/COMPATIBILITY.md` 체크리스트)

## [#5 feat(desktop): Kiro 로그인 첫 화면](https://github.com/rkddlsxo/kirothon-team-005/pull/5)

- 작성자: @yunttai
- 원본 브랜치: `feat/kiro-login-gate` (`0c8363166b28b51cb95243585d83922ba02c3d4d`)
- 병합 커밋: `13b474830cebf97cfaeae42e7773282a3ce2aef5`
- 생성: 2026-11-14T08:21:26Z · 병합: 2026-11-14T08:21:32Z
- 일반 댓글: 0개 · 리뷰 댓글: 0개

### 원본 설명

## 요약
Kiro가 연결되지 않았으면 첫 화면을 Kiro 로그인 화면으로 바꿨습니다. (A, 데스크톱 통합 + C 영역 렌더러 같은 PR)

## 변경
- 로그인 화면: GitHub, Google, AWS Builder ID 로그인 버튼, 터미널에서 로그인(조직 계정 등), 다시 확인, 나중에 하기
- 로그인 흐름 `src/main/kiroLogin.js`: `kiro-cli login --social github|google` / `--license free`를 셸 없이 창 없이 실행, 2초마다 `whoami` 확인, 5분 제한·취소, 출력 원문 미보관(허용 도메인 https 주소와 일회용 코드만)
- 연결 전에는 분석·재시도·재생성·후속 질문·자동 분석·단축키 분석을 실행하지 않고 로그인 화면으로 보냄. OpenAI 호환 설정이 있어도 Kiro 로그인 필요(사용자 결정)
- '나중에 하기'는 저장하지 않음(앱을 켤 때마다 로그인 화면부터)
- 미설치면 공식 설치 안내 열기와 설치 명령 복사만(앱이 설치를 실행하지 않음)
- 생성 실패 시 연결 재확인, 로그인이 풀렸으면 로그인 화면
- IPC 추가: `kiro-login-start`, `kiro-login-cancel`, `kiro-login-open`, `open-kiro-install`, `skip-login`
- `scripts/check.js`: `openExternal`은 주소 검사 뒤 또는 고정 설치 주소만
- `node scripts/smoke.js --gate`: 로그인 화면 흐름 스모크

## C 확인 부탁
`src/renderer/index.html`(`#gate`, `#mainView`, `#mainFoot`), `renderer.js`(`renderGate`), `view.js`(`pickScreen`, `gateView`), `styles.css`(끝부분 로그인 화면 스타일). README "처음 사용하기" 갱신 요청은 `docs/handoff/A-desktop.md`.

## 검증
- `node --test "test/**/*.test.js"` 166개 통과, `node scripts/check.js` 통과, `node scripts/smoke.js` 통과, `node scripts/smoke.js --gate` 통과
- 실제 kiro-cli: 로그인된 상태에서 시작 -> "Already logged in" -> 연결됨 전환
- 실기기(사용자): 로그아웃 상태에서 앱 버튼으로 브라우저 로그인 후 메인 화면 전환 확인

## [#6 docs(release): README Demo 줄에 v0.1.0 프리릴리스 링크](https://github.com/rkddlsxo/kirothon-team-005/pull/6)

- 작성자: @yunttai
- 원본 브랜치: `feat/release-v0.1.0` (`0686b7290efdc72d4a471079085309c37ec88a92`)
- 병합 커밋: `fa405b080242a22d343cabf13f8f03af44916b82`
- 생성: 2026-11-14T08:31:38Z · 병합: 2026-11-14T08:31:44Z
- 일반 댓글: 0개 · 리뷰 댓글: 0개

### 원본 설명

README의 Demo 줄에 v0.1.0 프리릴리스(Windows portable exe) 링크를 넣습니다. 릴리스는 이 PR 머지 커밋에 v0.1.0 태그로 만듭니다.
