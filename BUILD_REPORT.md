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
| 제품 내부 AI | Kiro CLI 비대화형 모드를 공급자로 연동(`kiro-cli login` 세션 또는 `KIRO_API_KEY`). 앱 전용 임시 폴더에서 실행해 저장소 설정과 분리 | `src/ai/providers/kiro.js` |
| 품질 개선 명세 | 검색 재시도, 출처 내용 검증, 프롬프트 구분자 보호, Kiro 실측을 요구사항·설계·작업으로 관리 | `.kiro/specs/ai-search-quality/` |
| 개발 자동화 | Hook 11개(위험 명령·비밀값 차단, 저장 시 테스트·보안 점검 등), steering 12개, 역할별 agent 5개, skill 4개, workflow 3개, 개발용 MCP 서버(도구 6개) | `.kiro/`, `scripts/hooks/`, `scripts/mcp/`, [docs/KIRO_USAGE.md](docs/KIRO_USAGE.md) |
| Kiro 실측 | `scripts/measure-kiro.js`로 응답 시간과 JSON 준수율 측정 | `.kiro/specs/ai-search-quality/tasks.md` 6.1 |
| 발표 | 발표 자료를 HTML로 작성하고 PDF로 출력 | `PRESENTATION.pdf` |

## 최종 검증 결과

- `npm test`: 121개 중 121개 통과 (입력 검증, 검색·재검색, 스키마 정규화·출처 내용 검증, 프롬프트, 서비스 흐름, 공급자, Kiro 실측 스크립트, Hook, MCP, 속성 기반 테스트, 화면 이벤트 계약, 결과 창 판단 로직, 입력 Enter 키 판단).
- 앱 이름을 "아는척"으로 바꾸고 결과 창을 Kiro IDE 다크 테마 색으로 다시 꾸몄습니다. 아이콘은 `docs/assets/icon.svg`(창·트레이용 PNG는 같은 도형으로 생성). 창의 항상 위 고정을 없앴고(자동 분석으로 뜰 때만 한 번 앞으로), 입력 칸에서 Enter로 바로 분석합니다(Shift+Enter 줄바꿈, 한글 조합 중 Enter 무시).
- `npm run check`: 위험 패턴 점검 통과.
- `npm run smoke`: AI·검색 보강(`main` `dad4c8d`)을 합친 뒤 실제 Electron 창에서 "양자 컴퓨터"를 위키백과로 검색(출처 3개)하고 문장 6개, 예상 질문 5개, 화제 전환 3개를 렌더링. 이벤트 순서 `start, stage:searching, sources, stage:generating, result, stage:done`, 렌더러에 Node 접근 없음 확인. 오프라인 간이 모드가 없어진 뒤로 smoke는 테스트용 고정 응답 공급자를 씁니다. 같은 실행에서 `docs/assets/screenshot.png`를 새로 찍었고, `npm run pdf`로 `PRESENTATION.pdf`를 다시 만들었습니다.
- Kiro CLI 실측(B, 2026-11-14, kiro-cli 3.3.0, 로그인 세션): 6회 중 3회 완료. JSON 파싱 3/3, 목표 개수 충족 3/3, 응답 20.7~28.0초(중앙값 22.9초). 자세한 표는 `.kiro/specs/ai-search-quality/tasks.md` 6.1.
- 결과 창 수정 중 Electron이 실행 정책으로 막혔던 동안에는, 실제 `renderer.js`를 가짜 DOM에서 실제 서비스·당시 오프라인 공급자와 함께 돌리는 임시 하네스로 아래 결함 수정을 24개 점검 항목으로 확인했습니다(모두 통과). 하네스는 저장소에 포함하지 않았습니다.
- `npm audit`: 런타임 의존성 없음. 개발 도구(electron-builder 하위 minimatch)에 중간 심각도 6건.
- 테스트 중 발견해 고친 결함: 렌더러 `api` 변수 이름 충돌로 화면이 동작하지 않던 문제, `hidden` 속성이 CSS에 덮여 빈 배너가 보이던 문제, 창 크기가 작업 영역보다 클 때의 위치 계산 가정(테스트에서 발견).
- 결과 창(UI) 점검에서 발견해 고친 결함:
  - 검색 자료가 부족하거나 검색이 실패했다는 안내가 결과 표시와 함께 지워지던 문제. 이제 생성 부족 안내와 함께 유지됩니다.
  - "다시 만들기"를 누른 뒤 진행 표시가 없고 여러 번 요청되던 문제. 이제 해당 항목 버튼만 "만드는 중…"으로 잠깁니다.
  - 후속 질문을 Enter 연타나 버튼으로 중복 요청할 수 있던 문제. 한글 입력 조합 중 Enter도 요청을 보내던 문제를 함께 막았습니다.
  - 후속 질문 입력 오류가 후속 질문 칸이 아니라 상단 안내에 표시되던 문제.
  - 후속 질문 답변 영역에 "null" 글자가 끼어 들어가던 문제(`replaceChildren`에 빈 값 전달).
  - 출처 내용 검증 도입 후 `basis: 'general'`인데 출처 ID가 남은 문장에도 "근거" 표시가 붙던 문제. 이제 `basis: 'sourced'`인 문장만 출처를 표시합니다(`.kiro/steering/renderer.md` 규칙).
- 판단 로직을 `src/renderer/view.js`로 분리해 Node 테스트(`test/renderer/view.test.js`)로 검증합니다. `src/core/service.js`의 이벤트 형식은 바꾸지 않았고 계약 테스트만 추가했습니다.

## 검증하지 못한 항목

- **실제 프로그램에서의 선택 감지**: 이 환경에서는 포커스를 가질 수 있는 대상 프로그램이 없어 UI Automation 폴링을 종단 확인하지 못했습니다. WinForms TextBox는 TextPattern을 제공하지 않아 감지되지 않는 것도 확인했습니다. 시연 대상(메모장, 브라우저 등)에서 실측이 필요합니다.
- **Kiro CLI 실측 나머지**: 6회 중 3회가 끝난 뒤 측정 프로세스가 중단됐습니다(원인 미확인). 주제 3(영어 혼합)과 실측 기반 프롬프트 튜닝(tasks.md 6.2, 6.3)은 아직입니다.
- **외부 제공자 사용 규정**: Kiro 구독을 최종 사용자 서비스에 쓰는 것이 허용되는지 확인하지 못했습니다.
- **패키징**: `npm run dist` 빌드는 실행하지 않았습니다.
- **배포 URL/시연 영상**: 없음. README의 Demo 줄에 영상 링크를 추가해야 합니다.
- **결과 창의 직접 조작**: smoke는 분석 한 번의 흐름만 확인합니다. "다시 만들기" 연타, 후속 질문 Enter 연타(한글 입력 포함), 빈 후속 질문 안내는 임시 하네스로만 확인했고 실제 창에서 손으로 눌러 보지는 않았습니다. 시연 전에 `npm start`로 확인이 필요합니다.

참고: 작업 PC에서 한동안 Windows 애플리케이션 제어 정책이 서명되지 않은 `electron.exe` 실행을 막았습니다. 그런 PC에서는 PDF만 서명된 Edge로 만들 수 있습니다(PowerShell).

```powershell
& "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --no-pdf-header-footer "--print-to-pdf=$PWD\PRESENTATION.pdf" ([Uri]"$PWD\docs\presentation.html").AbsoluteUri
```