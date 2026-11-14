# A 담당(데스크톱 통합) 인수인계

C가 `BUILD_REPORT.md`와 발표 자료에 옮길 수 있게 정리한 기록이다. 날짜는 2026-11-14.

## Kiro 활용 기록 (BUILD_REPORT용)

| 단계 | Kiro로 한 일 | 산출물 |
|---|---|---|
| 스펙 | 데스크톱 안정화 요구사항(EARS), 설계(속성 3개), 의존성 그래프가 있는 작업 목록 작성 | `.kiro/specs/desktop-compat-hardening/` |
| 스티어링 | A 영역 규칙을 `src/main`, `src/native` 파일을 열 때 자동 적용되도록 고정 | `.kiro/steering/desktop.md` |
| 훅 | A 영역 파일 저장 시 `npm test`와 `npm run check`, 작업 완료 시 `npm run smoke` 자동 실행 | `.kiro/hooks/desktop-test-on-save.json`, `desktop-smoke-after-task.json` |
| 구현 | 호환성 측정 도구, 드래그 감지와 미지원 안내, 설정 가능한 폴링, 창 배치 보정, 패키징 확인 | `scripts/compat*`, `src/native/selection.ps1`, `src/main/*` |
| 코드 리뷰 | semantic reviewer로 변경분 검토. 중간 심각도 5건과 낮음 8건 지적 | `docs/handoff/A-review.md` |
| 리뷰 반영 | 지적 중 조치 가능한 항목을 수정하고 정적 점검 규칙 추가 | `docs/SECURITY_REVIEW.md` "A 영역 추가 검토" |
| 검증 | 단위·속성 테스트, 실제 창 스모크, 패키징된 앱 스모크 | 아래 결과 |

실제로 리뷰와 실행 검증이 잡은 결함: 중복·오탐 안내(제목 표시줄 이동에도 안내), 안내 문구와 단축키 동작 불일치, 왼손잡이 마우스 반전, 절대 경로 조합 오류(실제 헬퍼 실행에서 발견, 단위 테스트는 통과했었음).

## 검증 결과

- `npm test`: 56개 통과
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