# BUILD_REPORT

Kiro를 어느 단계에서 어떻게 썼는지 기록합니다. 검증 수치는 2026-11-14 로컬 실행 결과입니다.

| 단계 | Kiro 활용 | 산출물 |
|---|---|---|
| 요구사항 | `prd-to-repo` 스킬로 PRD.md를 읽고 FR-01~08, 비기능, 완료 기준을 인수 기준(EARS)으로 정리 | `.kiro/specs/conversation-cheatsheet/requirements.md` |
| 설계 | 아키텍처, 컴포넌트 인터페이스, 정확성 속성 5개 정의. PRD 미확정 사항(Kiro 연동 가능 여부)은 Provider 추상화로 해소 | `design.md` |
| 작업 계획 | 의존성 그래프가 있는 작업 목록 | `tasks.md` |
| 스티어링 | 개인정보, 출처, 렌더러 규칙, 검증 명령을 항상 포함 지침으로 고정 | `.kiro/steering/product.md` |
| 구현 | Electron 앱, 코어 모듈, UI Automation 헬퍼, 공급자 3종 | `src/` |
| 테스트 | 단위 테스트와 난수 기반 속성 테스트, 실제 창 스모크 테스트 | `test/`, `scripts/smoke.js` |
| 보안 검토 | 위협 분석 표, 정적 점검 스크립트, `npm audit` 확인 | `docs/SECURITY_REVIEW.md`, `scripts/check.js` |
| 제품 내부 AI | Kiro CLI 비대화형 모드를 공급자로 연동(키가 있을 때) | `src/ai/providers/kiro.js` |
| 발표 | 발표 자료를 HTML로 작성하고 PDF로 출력 | `PRESENTATION.pdf` |

## 최종 검증 결과

- `npm test`: 57개 중 57개 통과 (입력 검증, 검색, 스키마 정규화, 서비스 흐름, 공급자, 속성 기반 테스트, 화면 이벤트 계약, 결과 창 판단 로직).
- `npm run check`: 위험 패턴 점검 통과.
- `npm run smoke` (UI 수정 전 실행 기록): 실제 Electron 창에서 "양자 컴퓨터"를 위키백과로 검색(출처 3개)하고 문장 6개, 예상 질문 5개, 화제 전환 3개를 렌더링. 렌더러에 Node 접근 없음 확인. 이 실행은 오프라인 간이 공급자를 사용했습니다.
- 결과 창 수정 후에는 Electron을 실행할 수 없어(아래 "검증하지 못한 항목"), 실제 `renderer.js`를 가짜 DOM에서 실제 서비스·오프라인 공급자와 함께 돌리는 임시 하네스로 아래 결함 수정을 24개 점검 항목으로 확인했습니다(모두 통과). 하네스는 저장소에 포함하지 않았습니다.
- `npm audit`: 런타임 의존성 없음. 개발 도구(electron-builder 하위 minimatch)에 중간 심각도 6건.
- 테스트 중 발견해 고친 결함: 렌더러 `api` 변수 이름 충돌로 화면이 동작하지 않던 문제, `hidden` 속성이 CSS에 덮여 빈 배너가 보이던 문제, 창 크기가 작업 영역보다 클 때의 위치 계산 가정(테스트에서 발견).
- 결과 창(UI) 점검에서 발견해 고친 결함:
  - 검색 자료가 부족하거나 검색이 실패했다는 안내가 결과 표시와 함께 지워지던 문제. 이제 생성 부족 안내와 함께 유지됩니다.
  - "다시 만들기"를 누른 뒤 진행 표시가 없고 여러 번 요청되던 문제. 이제 해당 항목 버튼만 "만드는 중…"으로 잠깁니다.
  - 후속 질문을 Enter 연타나 버튼으로 중복 요청할 수 있던 문제. 한글 입력 조합 중 Enter도 요청을 보내던 문제를 함께 막았습니다.
  - 후속 질문 입력 오류가 후속 질문 칸이 아니라 상단 안내에 표시되던 문제.
  - 후속 질문 답변 영역에 "null" 글자가 끼어 들어가던 문제(`replaceChildren`에 빈 값 전달).
- 판단 로직을 `src/renderer/view.js`로 분리해 Node 테스트(`test/renderer/view.test.js`)로 검증합니다. `src/core/service.js`의 이벤트 형식은 바꾸지 않았고 계약 테스트만 추가했습니다.

## 검증하지 못한 항목

- **실제 프로그램에서의 선택 감지**: 이 환경에서는 포커스를 가질 수 있는 대상 프로그램이 없어 UI Automation 폴링을 종단 확인하지 못했습니다. WinForms TextBox는 TextPattern을 제공하지 않아 감지되지 않는 것도 확인했습니다. 시연 대상(메모장, 브라우저 등)에서 실측이 필요합니다.
- **Kiro CLI 실제 호출**: `kiro-cli`가 설치돼 있지 않아 어댑터를 가짜 프로세스로만 테스트했습니다. 출력 JSON 준수율과 응답 시간은 미측정입니다.
- **외부 제공자 사용 규정**: Kiro 구독을 최종 사용자 서비스에 쓰는 것이 허용되는지 확인하지 못했습니다.
- **패키징**: `npm run dist` 빌드는 실행하지 않았습니다.
- **배포 URL/시연 영상**: 없음. README의 Demo 줄에 영상 링크를 추가해야 합니다.
- **결과 창 수정 후 smoke와 PDF 재생성**: 2026-11-14 작업 PC에서는 Windows 애플리케이션 제어 정책이 서명되지 않은 `electron.exe`(45.3.2) 실행을 차단해 `npm run smoke`, `npm run pdf`, `npm start`를 실행하지 못했습니다. 보안 설정은 바꾸지 않았습니다.
  - `PRESENTATION.pdf`는 `npm run pdf` 대신 서명된 Microsoft Edge의 헤드리스 인쇄로 `docs/presentation.html`에서 다시 만들었습니다(7쪽, 960×540pt, 기존 PDF와 같은 Chromium 엔진). 최신 수치(테스트 57개)는 반영됐습니다.
  - `docs/assets/screenshot.png`는 아직 수정 전 화면이라 PDF 안의 화면 예시도 수정 전 화면입니다. 실제 앱을 띄워야 찍을 수 있어 이 PC에서는 갱신하지 못했습니다.

  시연 PC에서 아래 명령으로 확인하고, 스크린샷을 갱신한 뒤 PDF를 한 번 더 만들어야 합니다.

  ```bash
  npm ci
  npm test            # 57개 통과 확인
  npm run check
  npm run smoke       # 출력 JSON의 "ok": true 확인
  npm start           # 다시 만들기, 후속 질문 Enter 연타, 빈 후속 질문 안내를 직접 확인
  # 스크린샷 갱신(PowerShell): smoke 실행 중 결과 창을 캡처
  $env:CC_SMOKE_SHOT = "$PWD\docs\assets\screenshot.png"; npm run smoke; Remove-Item Env:\CC_SMOKE_SHOT
  npm run pdf         # 새 스크린샷과 최신 수치로 PRESENTATION.pdf 재생성
  ```

  Electron이 막힌 PC에서 PDF만 다시 만들 때(PowerShell):

  ```powershell
  & "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --no-pdf-header-footer "--print-to-pdf=$PWD\PRESENTATION.pdf" ([Uri]"$PWD\docs\presentation.html").AbsoluteUri
  ```

  위 명령을 시연 PC에서 실행해 확인하기 전까지 smoke, 실제 화면, 최신 스크린샷은 **미검증**입니다.