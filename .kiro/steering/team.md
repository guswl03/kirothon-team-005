---
inclusion: always
---
# 팀 작업 규칙

- 역할 브랜치에서 작업한다: `feat/desktop`(A), `feat/ai`(B), `feat/ui`(C). `main`에 직접 커밋하지 않는다.
- 자기 역할의 소유 디렉터리 밖을 바꿔야 하면 먼저 사용자에게 알린다. `guard-write` Hook이 확인을 요청한다.
- 커밋은 작업 단위로 작게 나눈다. 메시지는 `feat(ai): ...`, `fix(ui): ...`처럼 영역을 붙인다.
- push, PR 생성, 브랜치 삭제는 사용자가 요청할 때만 한다.
- 합치기 전에 테스트, 보안 점검, 스모크 세 가지를 모두 통과시킨다.

#[[file:docs/TEAM_WORKFLOW.md]]
