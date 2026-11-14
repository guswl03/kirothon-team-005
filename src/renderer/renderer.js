'use strict';
// 렌더러: innerHTML을 쓰지 않고 textContent로만 DOM을 만든다(XSS 방지).
const $ = (id) => document.getElementById(id);
const bridge = window.api;

const state = { reqId: 0, result: null, sources: [], app: null, busy: false };

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 1600);
}
async function copy(text) { await bridge.copy(text); toast('복사했어요'); }

const tone = () => document.querySelector('input[name=tone]:checked').value;
function setTone(v) { const r = document.querySelector(`input[name=tone][value=${v}]`); if (r) r.checked = true; }

function setStatus(msg) { const s = $('status'); s.hidden = !msg; s.textContent = msg || ''; }
function setError(msg) { $('error').hidden = !msg; $('errorText').textContent = msg || ''; }
function setNotice(msg) { const n = $('notice'); n.hidden = !msg; n.textContent = msg || ''; }

function srcBadges(ids) {
  if (!ids || !ids.length) return h('span', { class: 'badge gen' }, '일반 표현 · 출처 없음');
  return ids.map((id) => h('span', { class: 'badge src' }, `근거 ${id}`));
}

function copyBtn(text) { return h('button', { onclick: () => copy(text), 'aria-label': `복사: ${text.slice(0, 20)}` }, '복사'); }
function regenBtn(kind, index) {
  return h('button', { onclick: () => bridge.regenerate({ kind, index, direction: $('direction').value }), 'aria-label': '이 항목만 다시 만들기' }, '다시 만들기');
}

function render() {
  const r = state.result;
  $('results').hidden = !r;
  if (!r) return;
  const terms = r.terms || [];
  $('meaning').hidden = !r.context && !terms.length;
  $('contextLine').hidden = !r.context;
  $('contextLine').textContent = r.context ? `쉽게 말하면: ${r.context}` : '';
  $('terms').replaceChildren(...terms.map((t) => h('li', {},
    h('div', { class: 'termHead' }, h('strong', {}, t.term),
      t.sourceIds.length ? srcBadges(t.sourceIds)
        : h('span', { class: t.confidence === 'high' ? 'badge gen' : 'badge est' }, t.confidence === 'high' ? 'AI 설명 · 출처 없음' : 'AI 추정 · 확실하지 않아요')),
    h('p', { class: 'text' }, t.meaning),
    t.origin ? h('p', { class: 'hint' }, `유래: ${t.origin}`) : null,
    t.inThisText ? h('p', { class: 'inText' }, `이 문장에서는: ${t.inThisText}`) : null)));
  const first = r.statements[0];
  $('heroText').textContent = first ? first.text : '활용할 문장을 만들지 못했어요.';
  $('heroMeta').replaceChildren(...(first ? [].concat(srcBadges(first.sourceIds)) : []));
  $('heroCopy').disabled = !first;
  $('heroCopy').onclick = () => first && copy(first.text);

  $('statements').replaceChildren(...r.statements.map((s, i) => h('li', {},
    h('p', { class: 'text' }, s.text),
    h('div', { class: 'meta' }, srcBadges(s.sourceIds)),
    h('div', { class: 'actions' }, copyBtn(s.text), regenBtn('statement', i)))));

  $('questions').replaceChildren(...r.questions.map((q, qi) => h('details', { class: 'q' },
    h('summary', {}, q.question),
    h('ul', {}, q.answers.map((a) => h('li', {},
      h('p', { class: 'text' }, a.text),
      h('div', { class: 'actions' }, copyBtn(a.text), srcBadges(a.sourceIds)))),
      h('li', {}, h('div', { class: 'actions' }, regenBtn('question', qi)))))));

  $('switches').replaceChildren(...r.topicSwitches.map((s, i) => h('li', {},
    h('div', { class: 'meta' }, h('span', { class: 'badge' }, s.topic)),
    h('p', { class: 'text' }, s.line),
    h('div', { class: 'actions' }, copyBtn(s.line), regenBtn('switch', i)))));

  $('facts').replaceChildren(...r.keyFacts.map((f) => h('li', {}, f.text, ' ', srcBadges(f.sourceIds))));
  if (r.shortfalls.length) setNotice(`정보가 부족해 일부는 목표보다 적게 만들었어요: ${r.shortfalls.join(', ')}. 부족한 부분은 지어내지 않았어요.`);
  else setNotice('');
}

function renderSources(ev) {
  state.sources = ev.sources || [];
  const msg = { ok: '', insufficient: '관련 자료를 충분히 찾지 못했어요. 아래 문장은 출처 없는 일반 표현이에요.', failed: `검색에 실패했어요(${ev.error || '네트워크 오류'}). 확인되지 않은 정보는 사실로 표시하지 않아요.` }[ev.status] || '';
  $('srcStatus').textContent = msg;
  if (ev.status !== 'ok') setNotice(msg);
  $('sources').replaceChildren(...state.sources.map((s) => h('li', {},
    h('strong', {}, `${s.id} · ${s.name}`), h('br'),
    h('button', { class: 'linkbtn', onclick: () => bridge.openLink(s.url) }, '원문 열기'),
    h('span', { class: 'hint' }, ` · 확인 시점 ${new Date(s.retrievedAt).toLocaleString('ko-KR')}`))));
}

function onEvent(ev) {
  if (ev.type === 'invalid') { setStatus(''); setError(''); setNotice(ev.message); return; }
  if (ev.type === 'notice') { setNotice(ev.message); return; }
  if (ev.type === 'start') {
    state.reqId = ev.requestId; state.result = null; setError(''); setNotice('');
    $('fuOut').replaceChildren(); $('results').hidden = true; setTone(ev.tone); setBusy(true); return;
  }
  if (ev.requestId !== state.reqId) return;        // 이전 요청의 늦은 응답 무시
  switch (ev.type) {
    case 'stage':
      if (ev.stage === 'searching') setStatus('관련 정보를 검색하는 중…');
      else if (ev.stage === 'generating') setStatus(ev.provider ? `${ev.provider}로 문장을 만드는 중…` : '문장을 만드는 중…');
      else { setStatus(''); setBusy(false); }
      break;
    case 'sources': renderSources(ev); break;
    case 'result':
      state.result = ev.result; $('providerNote').textContent = `생성: ${ev.provider}`;
      showGeneratedBy(ev.providerId, ev.provider); setStatus(''); render(); setBusy(false); break;
    case 'error': setStatus(''); setBusy(false); setError(ev.message); break;
    case 'regenerated':
      if (ev.item) {
        const key = { statement: 'statements', question: 'questions', switch: 'topicSwitches' }[ev.kind];
        state.result[key][ev.index] = ev.item; render(); toast('새로 만들었어요');
      } else toast(ev.message || '다시 만들지 못했어요');
      break;
    case 'followup-start': $('fuOut').replaceChildren(h('p', { class: 'hint', role: 'status' }, '답변을 만드는 중…')); break;
    case 'followup-error': $('fuOut').replaceChildren(h('div', { class: 'banner error' }, ev.message)); break;
    case 'followup-result':
      $('fuOut').replaceChildren(
        h('p', { class: 'hint' }, `질문: ${ev.question}`),
        ev.insufficient ? h('div', { class: 'banner' }, ev.note || '답변을 만들 정보가 부족해요. 무리하게 단정하지 않았어요.') : null,
        h('ul', { class: 'cards' }, ev.answers.map((a) => h('li', {}, h('p', { class: 'text' }, a.text), h('div', { class: 'actions' }, copyBtn(a.text), srcBadges(a.sourceIds))))));
      break;
    default: break;
  }
}

/** 결과 위에 실제로 어떤 AI가 만들었는지 표시한다. */
function showGeneratedBy(id, label) {
  const el = $('genBy');
  el.textContent = id === 'kiro' ? 'Kiro가 만든 결과예요.' : `${label || 'AI'}가 만든 결과예요.`;
  el.className = id === 'kiro' ? 'genBy' : 'genBy other';
}

const KIRO_TEXT = {
  checking: ['Kiro 확인 중…', 'wait'],
  connected: ['Kiro 연결됨', 'ok'],
  not_installed: ['Kiro 미설치', 'bad'],
  not_logged_in: ['Kiro 로그인 필요', 'bad'],
  error: ['Kiro 확인 실패', 'bad'],
};

function renderKiroStatus(k) {
  const [label, cls] = KIRO_TEXT[(k && k.status) || 'checking'] || KIRO_TEXT.error;
  const el = $('kiroStatus');
  el.textContent = label;
  el.className = `conn ${cls}`;
  el.title = (k && k.message) || '';
  $('kiroCheck').hidden = !k || k.status === 'checking';
}

function setBusy(b) { state.busy = b; $('analyze').disabled = b; }

function applyAppState(s) {
  state.app = s;
  $('auto').checked = s.autoAnalyze;
  $('auto').disabled = !s.autoSupported;
  $('autoLabel').textContent = !s.autoSupported ? '자동 분석: Windows 전용' : s.autoAnalyze ? '자동 분석 켜짐' : '자동 분석 꺼짐';
  const sel = $('provider');
  if (!sel.options.length) {
    const names = { auto: '자동 선택(Kiro 우선)', kiro: 'Kiro CLI', openai: 'OpenAI 호환' };
    s.providers.forEach((p) => sel.append(h('option', { value: p }, names[p])));
  }
  sel.value = s.provider;
  renderKiroStatus(s.kiro);
  if (!state.result) $('providerNote').textContent = `사용 중: ${s.activeProvider.label}${s.activeProvider.external ? '' : ' (외부 전송 없음)'}`;
}

function submit() {
  const text = $('text').value;
  if (!text.trim()) { setNotice('내용을 입력하거나 붙여넣어 주세요.'); $('text').focus(); return; }
  bridge.analyze({ text, tone: tone(), note: $('note').value, direction: $('direction').value });
}

$('analyze').addEventListener('click', submit);
$('text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); });
$('retry').addEventListener('click', () => { setError(''); bridge.retry(); });
$('close').addEventListener('click', () => bridge.hide());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') bridge.hide(); });
$('auto').addEventListener('change', async (e) => { const on = await bridge.setAuto(e.target.checked); e.target.checked = Boolean(on); });
$('provider').addEventListener('change', (e) => bridge.setProvider(e.target.value));
$('kiroCheck').addEventListener('click', () => bridge.checkKiro());
document.querySelectorAll('input[name=tone]').forEach((r) => r.addEventListener('change', () => { if (state.result) bridge.setTone(tone()); }));
$('fuBtn').addEventListener('click', () => bridge.followup($('fuInput').value));
$('fuInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') bridge.followup($('fuInput').value); });

bridge.onEvent(onEvent);
bridge.onState(applyAppState);
bridge.onIncoming(({ text }) => { $('text').value = text; });
bridge.getState().then((s) => { applyAppState(s); setTone(s.tone); });