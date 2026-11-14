# A 담당(데스크톱 통합) 인수인계

C가 `BUILD_REPORT.md`와 발표 자료에 옮길 수 있게 정리한 기록이다. 날짜는 2026-11-14.

## Kiro 활용 기록 (BUILD_REPORT용)

| 단계 | Kiro로 한 일 | 산출물 |
|---|---|---|
| 스펙 | 데스크톱 안정화 요구사항(EARS), 설계(속성 3개), 의존성 그래프가 있는 작업 목록 작성 | `.kiro/specs/desktop-compat-hardening/` |
| 스티어링 | A 영역 규칙을 `src/main`, `src/native` 파일을 열 때 자동 적용되도록 고정 | `.kiro/steering/desktop.md` |
| 훅 | 작업 완료 시 `npm run smoke` 자동 실행(B의 훅은 스모크를 돌리지 않아 A 쪽에 유지). 저장 시 테스트·보안 점검은 B가 만든 공통 훅(`test-on-save`, `security-check-on-save`)이 A 영역도 처리하므로 중복 훅은 제거함 | `.kiro/hooks/desktop-smoke-after-task.json` |
| 구현 | 호환성 측정 도구, 드래그 감지와 미지원 안내, 설정 가능한 폴링, 창 배치 보정, 패키징 확인 | `scripts/compat*`, `src/native/selection.ps1`, `src/main/*` |
| 코드 리뷰 | semantic reviewer로 변경분 검토. 중간 심각도 5건과 낮음 8건 지적 | `docs/handoff/A-review.md` |
| 리뷰 반영 | 지적 중 조치 가능한 항목을 수정하고 정적 점검 규칙 추가 | `docs/SECURITY_REVIEW.md` "A 영역 추가 검토" |
| 검증 | 단위·속성 테스트, 실제 창 스모크, 패키징된 앱 스모크 | 아래 결과 |

실제로 리뷰와 실행 검증이 잡은 결함: 중복·오탐 안내(제목 표시줄 이동에도 안내), 안내 문구와 단축키 동작 불일치, 왼손잡이 마우스 반전, 절대 경로 조합 오류(실제 헬퍼 실행에서 발견, 단위 테스트는 통과했었음).

## 검증 결과

- `npm test`: A 영역만 56개 통과(B·C 변경을 합친 뒤 전체 121개 통과)
- `npm run check`: 통과. PowerShell 헬퍼 규칙을 추가했고, 위반 코드를 넣으면 실패하는 것을 확인함
- `npm run smoke`: 통과(위키백과 출처 3개, 문장 6개, 예상 질문 5개, 화제 전환 3개)
- `npm run dist`: portable exe(105MB) 생성. `selection.ps1`이 `app.asar.unpacked`로 풀리는 것 확인
- 패키징된 앱(`dist/win-unpacked`)을 스모크 모드로 실행해 동일한 결과 확인
- PowerShell 헬퍼를 실제로 실행해 4초간 오류 없이 동작하는 것 확인
- `npm run compat`이 실제 프로그램(Kiro IDE)에서 "TextPattern 지원" 판정을 출력하는 것 확인

## 확인하지 못한 것 (발표·README에 과장하지 말 것)

- **시연 대상 프로그램별 감지 실측**: 이 환경에서 직접 드래그를 할 수 없어 `docs/COMPATIBILITY.md` 표는 비어 있다. 사람이 시연 PC에서 `npm run compat`으로 채워야 한다.
- 드래그 판정, 프로세스별 1회 안내 같은 PowerShell 내부 동작은 실제 마우스 조작으로 확인하지 못했다.
- 포터블 exe 파일 자체(압축 해제 실행)는 실행하지 않았다. 같은 내용인 `win-unpacked`로 대신 검증했다.
- 멀티 모니터와 배율 150% 이상에서의 실제 창 위치는 좌표 계산 테스트로만 확인했다.
- 코드 서명이 없어 처음 실행할 때 Windows SmartScreen 경고가 뜰 수 있다.

## C에게 요청

- README "알려진 제한"에 "자동 감지는 TextPattern을 제공하는 프로그램에서만 동작, 미지원 시 앱이 한 번 안내"를 반영해 주세요.
- 시연 영상은 실측에서 "지원"으로 나온 프로그램으로 녹화하는 것을 추천합니다.
- 동의 창 문구가 바뀌었습니다("선택한 텍스트만 읽어요(드래그나 키보드 선택 모두 해당)"). 발표 자료의 개인정보 설명과 맞춰 주세요.

## 다른 담당과 합의가 필요한 항목

- B: 외부 AI 공급자로 바꿀 때 확인 창이 뜨도록 `set-provider`를 바꿨습니다(`src/main/main.js`). 공급자 목록이 바뀌면 알려 주세요.
- 새 IPC 채널은 추가하지 않았습니다. 렌더러(`C`) 변경은 없습니다.
## B의 변경(origin/main)을 합친 뒤 반영한 것

- `.kiro/steering/desktop.md`: B도 같은 이름의 파일을 만들어 충돌했다. A 파일을 기준으로 B의 문장(fileMatch 3개 경로, 공급자 자동 선택 순서)을 합쳤다.
- 훅: B의 공통 훅 `test-on-save`, `security-check-on-save`가 A 영역 저장도 처리하므로 A의 `desktop-test-on-save`는 제거했다. `desktop-smoke-after-task`는 B의 `verify`가 스모크를 돌리지 않아 유지하고, B의 규칙(`test/hooks/config.test.js`)에 맞게 `node scripts/smoke.js`를 직접 호출하도록 바꿨다.
- 앱 동작: B의 검색 재시도와 출처 검증, Kiro CLI 폴더 격리는 `src/ai/` 안에서 끝나는 변경이라 A 코드(`src/main`, `src/native`)는 바꾸지 않았다. 스모크로 다시 확인했다(출처 3개, 문장 6개, 질문 5개, 화제 전환 3개).
- 시연 시 체감 시간: 결과 창은 선택 후 약 0.7~1.2초에 뜨지만, Kiro CLI로 생성하면 첫 결과까지 응답 20.7~28.0초(중앙값 22.9초)가 더 걸린다. 이 수치는 B의 실측(`.kiro/specs/ai-search-quality/tasks.md` 6.1)이며 6회 중 3회만 완료됐다. 창이 뜬 뒤 "생성 중" 상태가 보이는 시간이므로 시연 시나리오에 반영해야 한다.

## B에게 요청

- `docs/KIRO_USAGE.md`의 개수 표에 A 산출물을 반영해 주세요: Specs 3개(`desktop-compat-hardening` 추가), Hooks 12개(`desktop-smoke-after-task` 추가). 이 문서는 A 소유가 아니라 직접 고치지 않았다.

## 메신저 드래그 감지 (2026-11-14 추가)

- 감지 순서: 포커스된 컨트롤 -> (드래그 끝) 커서 아래 요소와 상위 10단계 -> (옵션 켜짐, 카카오톡·디스코드만) Ctrl+C 복사 후 클립보드 복원.
- 옵션: 트레이 메뉴 "메신저 드래그 복사 (카카오톡·디스코드)". 기본 꺼짐, 켤 때 동의 창. 설정 필드 `copyFallback` 추가(`security.md`, 제품 설계 문서의 저장 설정 목록도 갱신, 공유 영역).
- 좌표: 헬퍼와 측정 도구가 `SetProcessDPIAware`를 호출해 커서와 UI Automation 좌표를 물리 픽셀로 맞춘다. 배율 125% 이상에서 "드래그 시작 위치가 컨트롤 안" 판정이 어긋나던 문제도 함께 고쳐진다.
- 확인한 것: 단위 테스트(인자, `via`, 허용 목록, 설정), `check.js` 위반 6종 탐지, 클립보드 백업·복원 5가지 경우 실제 실행, 옵션을 켠 헬퍼가 오류 없이 실행됨, 측정 도구 실행.
- 확인하지 못한 것: 실제 카카오톡·디스코드에서의 동작. 에이전트가 띄운 프로세스의 키 입력(SendInput, SendKeys)이 대상 창에 도달하지 않아 복사 경로를 끝까지 실행하지 못했다. `docs/COMPATIBILITY.md` 메신저 체크리스트로 사용자가 확인한다.
- C에게: 창 안에 이 옵션 스위치를 두려면 IPC 채널이 필요하다(현재는 트레이만). `appState().copyFallback`은 이미 렌더러로 전달된다.

## Kiro 로그인 첫 화면 (2026-11-14 추가)

- Kiro가 연결되지 않았으면 첫 화면이 로그인 화면이다. GitHub, Google, AWS Builder ID 버튼과 '터미널에서 로그인', '다시 확인', '나중에 하기'가 있다.
- C에게: 렌더러(`index.html`의 `#gate`, `#mainView`, `#mainFoot`, `renderer.js`의 `renderGate`, `view.js`의 `pickScreen`·`gateView`, `styles.css` 끝의 로그인 화면 스타일)를 A가 같은 PR로 바꿨다. README "처음 사용하기"에 (1) Kiro CLI 설치 (2) 아는척 실행 후 로그인 버튼 (3) 브라우저에서 로그인 순서를 적어 주세요.
- B에게: OpenAI 호환 설정이 있어도 Kiro 로그인 전에는 분석하지 않는다(사용자 결정). 공급자 선택 로직(`resolveProvider`)은 그대로다.
- 확인한 것: 로그인 화면 스모크(`node scripts/smoke.js --gate`: 첫 화면, 나중에 하기, 분석 시 다시 로그인 화면), 이미 로그인된 PC에서 실제 kiro-cli로 로그인 시작 -> "Already logged in" -> 연결됨 전환.
- 사용자 확인: 로그아웃 상태에서 앱 버튼으로 실제 브라우저 로그인 후 메인 화면 전환까지 확인했다(2026-11-14).
