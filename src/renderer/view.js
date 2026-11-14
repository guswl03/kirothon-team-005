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

  /** 진행 상태 문구. 내부 도구 이름(CLI 등) 대신 지금 하는 일을 말한다. */
  function stageMessage(stage, providerId) {
    if (stage === 'searching') return '어떤 얘기인지 찾아보는 중…';
    if (stage === 'generating') return providerId === 'kiro' ? 'Kiro가 자연스럽게 꺼낼 말을 고르는 중…' : '자연스럽게 꺼낼 말을 고르는 중…';
    return '';
  }

  /**
   * 검색 결과 첫 출처에서 뜻을 짧게 뽑는다(AI 생성 전 바로 보여 주기용). 문장 단위로 maxChars까지 담고,
   * 첫 문장부터 너무 길면 잘라 말줄임표를 붙인다. 출처가 없으면 null을 돌려 지어내지 않는다.
   */
  function quickMeaning(sources, maxChars = 140) {
    const s = Array.isArray(sources) ? sources.find((x) => x && typeof x.extract === 'string' && x.extract.trim()) : null;
    if (!s) return null;
    const body = s.extract.replace(/\s+/g, ' ').trim();
    const sentences = body.match(/[^.!?。]+[.!?。]+|[^.!?。]+$/g) || [body];
    let text = '';
    for (const raw of sentences) {
      const next = (text ? `${text} ` : '') + raw.trim();
      if (next.length > maxChars) break;
      text = next;
    }
    if (!text) text = `${body.slice(0, maxChars).trim()}…`;
    return { text, sourceId: s.id, name: s.name || s.id };
  }

  /**
   * 첫 화면 결정. Kiro가 연결됐거나 '나중에 하기'를 눌렀으면 메인 화면, 아니면 로그인 화면.
   * 상태가 아직 없으면(시작 직후) 로그인 화면의 '확인 중'을 보여 준다.
   */
  function pickScreen(app) {
    if (!app) return 'gate';
    if (app.kiro && app.kiro.status === 'connected') return 'main';
    return app.gateSkipped ? 'main' : 'gate';
  }

  /** 로그인 화면에서 보여 줄 부분과 문구 */
  function gateView(app) {
    const status = (app && app.kiro && app.kiro.status) || 'checking';
    const login = (app && app.login) || {};
    if (login.phase === 'waiting') {
      return { mode: 'waiting', message: login.message || '브라우저에서 로그인을 마치면 자동으로 넘어가요.', code: login.code || '', canOpen: Boolean(login.url) };
    }
    const after = { failed: login.message, timeout: login.message, cancelled: login.message }[login.phase] || '';
    if (status === 'checking') return { mode: 'checking', message: 'Kiro 연결을 확인하는 중이에요…', code: '', canOpen: false };
    if (status === 'not_installed') return { mode: 'install', message: after || '이 PC에 Kiro CLI가 없어요. 설치한 뒤 다시 확인을 눌러 주세요.', code: '', canOpen: false };
    if (status === 'error') return { mode: 'login', message: after || 'Kiro 연결을 확인하지 못했어요. 다시 확인하거나 로그인해 주세요.', code: '', canOpen: false };
    return { mode: 'login', message: after || '아는척은 Kiro로 문장을 만들어요. 쓰는 계정으로 로그인해 주세요.', code: '', canOpen: false };
  }

  return { pickScreen, gateView, searchMessage, composeNotice, pendingKey, createPending, canSubmitFollowup, invalidTarget, statementSourceIds, isSubmitKey, stageMessage, quickMeaning };
}));
