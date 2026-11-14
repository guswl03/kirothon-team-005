'use strict';
// 결과 창의 DOM과 무관한 판단 로직. 브라우저(window.CCView)와 Node 테스트(require) 양쪽에서 쓴다.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CCView = api;
}(typeof self !== 'undefined' ? self : this, () => {
  /** 검색 상태별 안내 문구. 정상(ok)이면 빈 문자열 */
  function searchMessage(status, error) {
    if (status === 'insufficient') return '관련 자료를 충분히 찾지 못했어요. 아래 문장은 출처 없는 일반 표현이에요.';
    if (status === 'failed') return `검색에 실패했어요(${error || '네트워크 오류'}). 확인되지 않은 정보는 사실로 표시하지 않아요.`;
    return '';
  }

  /** 상단 안내: 검색 부족/실패 안내와 생성 부족 안내를 함께 보여준다(결과가 와도 검색 안내를 지우지 않음). */
  function composeNotice({ searchStatus, searchError, shortfalls } = {}) {
    const parts = [];
    const s = searchMessage(searchStatus, searchError);
    if (s) parts.push(s);
    if (shortfalls && shortfalls.length) parts.push(`정보가 부족해 일부는 목표보다 적게 만들었어요: ${shortfalls.join(', ')}. 부족한 부분은 지어내지 않았어요.`);
    return parts.join(' ');
  }

  const pendingKey = (kind, index) => `${kind}:${index}`;

  /**
   * 재생성 중인 항목 집합. start는 이미 진행 중이면 null, 아니면 토큰을 돌려준다.
   * finish(key, token)은 토큰이 같을 때만 끝낸다(새 분석 이후 늦게 끝난 이전 요청이 새 상태를 지우지 않게).
   * 토큰 없이 finish(key)를 부르면 강제로 끝낸다.
   */
  function createPending() {
    const items = new Map();
    let seq = 0;
    return {
      start(key) {
        if (items.has(key)) return null;
        seq += 1;
        items.set(key, seq);
        return seq;
      },
      has: (key) => items.has(key),
      finish(key, token) {
        if (token === undefined || items.get(key) === token) items.delete(key);
      },
      clear() { items.clear(); },
    };
  }

  /** 후속 질문 제출 가능 여부: 진행 중이거나 빈 질문이면 거부 */
  function canSubmitFollowup({ busy, text }) {
    return !busy && typeof text === 'string' && text.trim().length > 0;
  }

  /** invalid 이벤트를 표시할 위치 */
  function invalidTarget(ev) {
    return ev && ev.scope === 'followup' ? 'followup' : 'main';
  }

  /** 문장에 붙일 출처 ID. basis가 'sourced'인 문장만 출처를 표시하고, 나머지는 일반 표현으로 보인다. */
  function statementSourceIds(s) {
    return s && s.basis === 'sourced' && Array.isArray(s.sourceIds) ? s.sourceIds : [];
  }

  /** 입력 칸에서 Enter만 누르면 분석한다. Shift+Enter는 줄바꿈, 한글 조합 중 Enter는 무시한다. */
  function isSubmitKey(e) {
    if (!e || e.key !== 'Enter') return false;
    if (e.isComposing || e.keyCode === 229) return false;
    return !e.shiftKey && !e.altKey;
  }

  return { searchMessage, composeNotice, pendingKey, createPending, canSubmitFollowup, invalidTarget, statementSourceIds, isSubmitKey };
}));
