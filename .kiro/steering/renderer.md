---
inclusion: fileMatch
fileMatchPattern: ["src/renderer/**"]
---
# 결과 창 UI 지침 (C 담당)

- DOM은 `document.createElement` + `textContent`로만 만든다. `innerHTML`, `insertAdjacentHTML`, `document.write` 금지. CSP는 `default-src 'none'`이고 `unsafe-inline`, `unsafe-eval`을 쓰지 않는다.
- 맨 위에 바로 쓸 문장을 보여 준다. 문장, 예상 질문, 화제 전환, 핵심 정보·출처를 구분해서 보여 준다.
- 예상 질문은 항상 "AI 추정"으로 표시한다(`estimated: true`).
- `basis: 'sourced'`인 항목만 출처 표시를 붙인다. `general`은 일반 표현으로 보여 준다.
- `shortfalls`가 있으면 부족한 항목을 그대로 알린다. 빈칸을 다른 내용으로 채우지 않는다.
- 검색 중, 생성 중 상태와 오류, 다시 시도 버튼을 보여 준다. 이전 요청(`requestId`)의 이벤트는 무시한다.
- 복사는 해당 문장 하나만 클립보드에 넣는다. 다른 프로그램에 자동 입력하지 않는다.
