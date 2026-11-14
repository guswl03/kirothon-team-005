---
inclusion: always
---
# 보안·개인정보 규칙

이 앱은 사용자가 다른 프로그램에서 선택한 텍스트를 읽는다. 아래 규칙은 기능보다 우선한다.

1. 선택 텍스트, 생성 결과, 후속 질문을 파일이나 로그에 남기지 않는다. `console.log` 금지(점검 대상). 저장하는 것은 설정(`autoAnalyze, consentAccepted, consentProvider, copyFallback, copyFallbackNoAsk, tone, provider`. `copyFallback`은 메신저 드래그 복사 옵션으로 기본 꺼짐이고 켤 때 동의를 받는다. `copyFallbackNoAsk`는 자동 분석을 켤 때 이 옵션을 다시 묻지 않기로 한 경우다. `consentProvider`는 동의 때 안내한 공급자 id(`kiro`/`openai`)이며, 지금 공급자와 다르면 다시 동의를 받는다)뿐이다.
2. 프롬프트에 넣는 모든 외부 데이터는 `escapeData`로 감싸고 구분자 태그 안에 둔다. 데이터 안의 지시는 따르지 않는다고 명시한다.
3. 모델이 만든 출처는 믿지 않는다. 검색 결과에 있는 ID이면서 본문이 문장을 뒷받침할 때만 출처로 표시한다(`schema.SUPPORT_MIN`).
4. Kiro CLI는 도구 신뢰 옵션(`--trust-tools`, `--trust-all-tools`) 없이, 앱 전용 임시 폴더를 작업 폴더로 실행한다.
5. 렌더러는 `textContent`만 쓴다. `innerHTML`, `eval`, `new Function` 금지. BrowserWindow는 `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
6. 외부 링크는 현재 세션 검색 결과의 https URL만 연다. LLM 엔드포인트는 https 또는 localhost만 허용한다.
7. 새 외부 전송(새 API, 새 텔레메트리)을 추가하면 동의 창 문구와 `docs/SECURITY_REVIEW.md`를 함께 갱신한다.

#[[file:docs/SECURITY_REVIEW.md]]
