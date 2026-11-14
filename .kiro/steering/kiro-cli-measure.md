---
inclusion: auto
name: kiro-cli-measure
description: Kiro CLI 로그인, 비대화형 실행, 응답 시간·JSON 준수율 실측과 프롬프트 튜닝 절차. kiro-cli 연동이나 실측, 크레딧, 응답 속도를 다룰 때 사용한다.
---
# Kiro CLI 연동과 실측

## 준비 (사용자가 직접)
1. 설치: [설치 페이지](https://kiro.dev/docs/getting-started/installation/)의 Windows PowerShell 명령. 인터넷 스크립트를 실행하므로 에이전트가 대신 실행하지 않는다.
2. `kiro-cli login`: 크레딧이 있는 계정으로 브라우저 로그인. 로그인 세션은 `KIRO_API_KEY`보다 먼저 쓰인다.
3. `kiro-cli whoami`로 확인.
4. API 키는 Pro 이상 요금제에서 app.kiro.dev에서 만든다. 키는 `$env:KIRO_API_KEY`로만 설정하고 파일에 쓰지 않는다.

## 실측
```powershell
node scripts/measure-kiro.js --runs 2             # 주제 3개 x 2회 = Kiro 호출 6회
```
출력은 숫자만 있다(응답 시간, JSON 파싱 성공률, 목표 개수 충족률, 평균 개수, 출처 연결 수). 생성된 문장은 남기지 않는다.

## 판단 기준과 조치
| 관찰 | 조치 |
|---|---|
| JSON 파싱 실패가 있음 | `RULES`의 "JSON 객체 하나만 출력" 지시를 작업 지시 바로 뒤에 한 번 더 둔다. `extractJson`이 못 읽는 출력 모양을 테스트로 추가한다. |
| 목표 개수 미달이 잦음 | 개수 목표 문장을 스키마 예시 앞으로 옮기고, 항목당 길이 제한(1~2문장)을 유지한다. |
| 응답 중앙값이 60초 넘음 | `SOURCE_CHARS`를 1200 -> 800으로 줄이고 다시 잰다. `KIRO_TIMEOUT_MS`는 최대값의 1.5배로 맞춘다. |
| 출처 연결이 0에 가까움 | `SUPPORT_MIN`이 너무 높은지 MCP `support_score`로 실제 문장을 확인한다. 기준을 낮추려면 테스트와 근거를 같이 남긴다. |

수치는 `BUILD_REPORT.md`(C 담당)에 넣도록 C에게 전달하고, `.kiro/specs/ai-search-quality/tasks.md`의 Task 6을 갱신한다.
