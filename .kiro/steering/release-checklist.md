---
inclusion: manual
---
# 합치기·제출 전 체크리스트

`/release-checklist`로 불러서 순서대로 확인한다.

1. `git status`가 깨끗하고, 현재 브랜치가 역할 브랜치인지 확인한다.
2. `node --test "test/**/*.test.js"` 전부 통과.
3. `node scripts/check.js` 통과.
4. `node scripts/smoke.js` 결과가 `"ok": true`이고 이벤트가 `start, stage:searching, sources, stage:generating, result, stage:done` 순서인지 확인.
5. `.kiro/specs/*/tasks.md`에서 남은 `[ ]` 항목이 의도한 것뿐인지 확인한다.
6. 공유 영역(service.js 이벤트, package.json, SECURITY_REVIEW.md)을 바꿨다면 팀에 알렸는지 확인한다.
7. 새 외부 전송이 있으면 동의 창 문구와 SECURITY_REVIEW.md를 갱신했는지 확인한다.
8. README의 실행 방법이 실제 명령과 맞는지 확인한다.
9. 마감(18:00) 전 마지막 push는 C가 맡는다. 그 전에 모두 합쳐진 상태에서 2~4번을 다시 실행한다.
