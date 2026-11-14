---
name: kiro-measure
description: Kiro CLI로 앱의 전체 생성 프롬프트를 실측하고(응답 시간, JSON 준수율, 목표 개수 충족률) 결과에 따라 프롬프트를 튜닝한다. "Kiro 실측", "응답 속도", "JSON이 깨진다", "개수가 모자란다"는 요청에 사용한다.
---

# Kiro CLI 실측과 프롬프트 튜닝

## 1. 준비 확인
- `kiro-cli --version`과 `kiro-cli whoami`를 실행한다. 실패하면 멈추고 사용자에게 `.kiro/steering/kiro-cli-measure.md`의 준비 절차를 안내한다. 설치 스크립트를 대신 실행하지 않는다.
- 크레딧이 든다. 실행 횟수(주제 3개 x `--runs`)를 사용자에게 먼저 알린다.

## 2. 기준선
```powershell
node scripts/measure-kiro.js --runs 2
```
요약 4줄(JSON 성공률, 목표 충족률, 응답 시간 중앙값·최대, 평균 개수)을 기록한다.

## 3. 원인별 조치 (한 번에 하나만 바꾼다)
| 관찰 | 바꿀 곳 | 확인 |
|---|---|---|
| JSON 파싱 실패 | `src/ai/prompt.js`의 작업 지시 끝에 출력 형식 재강조. 실패한 출력 모양을 `test/ai/schema.test.js`의 `extractJson` 사례로 추가 | 해당 테스트 + 재측정 |
| 개수 미달 | 개수 목표 문장을 스키마 예시 앞으로 이동 | 재측정에서 충족률 상승 |
| 응답이 느림 | `SOURCE_CHARS` 1200 -> 800 | 중앙값 비교, 출처 연결 수가 크게 줄지 않는지 |
| 출처 연결 0 | MCP `support_score`로 실제 문장 점수 확인 후 `SUPPORT_MIN` 검토 | `test/ai/schema.test.js` 경계 사례 추가 |

## 4. 마무리
- `node --test "test/**/*.test.js"`, `node scripts/check.js` 통과.
- `.kiro/specs/ai-search-quality/tasks.md`의 Task 6에 전후 수치를 적고 체크한다.
- 수치를 C에게 전달해 `BUILD_REPORT.md`의 "Kiro CLI 실제 호출" 항목을 갱신하게 한다.
- 생성된 문장 원문은 어디에도 붙여 넣지 않는다. 숫자만 남긴다.
