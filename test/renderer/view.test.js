'use strict';
// 결과 창의 DOM과 무관한 판단 로직(src/renderer/view.js) 테스트
const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../../src/renderer/view');

test('searchMessage: 상태별 검색 안내 문구', () => {
  assert.equal(view.searchMessage('ok'), '');
  assert.equal(view.searchMessage(undefined), '');
  assert.match(view.searchMessage('insufficient'), /충분히 찾지 못했어요/);
  assert.match(view.searchMessage('failed', 'timeout'), /검색에 실패했어요\(timeout\)/);
  assert.match(view.searchMessage('failed'), /네트워크 오류/);
});

test('composeNotice: 검색이 정상이고 부족 항목이 없으면 안내가 없다', () => {
  assert.equal(view.composeNotice({ searchStatus: 'ok', shortfalls: [] }), '');
  assert.equal(view.composeNotice({}), '');
});

test('composeNotice: 결과가 와도 검색 부족 안내를 유지한다 (버그 1)', () => {
  const n = view.composeNotice({ searchStatus: 'insufficient', shortfalls: [] });
  assert.equal(n, view.searchMessage('insufficient'));
});

test('composeNotice: 검색 실패와 생성 부족 안내를 모두 보여준다', () => {
  const n = view.composeNotice({ searchStatus: 'failed', searchError: 'x', shortfalls: ['활용 문장 3/5개', '화제 전환 1/3개'] });
  assert.ok(n.startsWith(view.searchMessage('failed', 'x')));
  assert.match(n, /활용 문장 3\/5개, 화제 전환 1\/3개/);
  assert.match(n, /지어내지 않았어요/);
});

test('composeNotice: 검색 정상 + 부족 항목만 있으면 부족 안내만', () => {
  const n = view.composeNotice({ searchStatus: 'ok', shortfalls: ['예상 질문 4/5개'] });
  assert.match(n, /^정보가 부족해/);
});

test('createPending: 같은 항목은 한 번만 시작되고 다른 항목에는 영향이 없다 (버그 2)', () => {
  const p = view.createPending();
  const k = view.pendingKey('statement', 1);
  const t = p.start(k);
  assert.notEqual(t, null);
  assert.equal(p.start(k), null);           // 진행 중 중복 시작 거부
  assert.equal(p.has(k), true);
  assert.equal(p.has(view.pendingKey('statement', 2)), false);
  assert.equal(p.has(view.pendingKey('question', 1)), false);
  p.finish(k, t);
  assert.equal(p.has(k), false);
  assert.notEqual(p.start(k), null);        // 끝난 뒤에는 다시 시작 가능
});

test('createPending: 이전 토큰으로는 새로 시작한 항목을 끝내지 못한다', () => {
  const p = view.createPending();
  const k = view.pendingKey('switch', 0);
  const old = p.start(k);
  p.clear();                                 // 새 분석 시작
  const fresh = p.start(k);
  p.finish(k, old);                          // 늦게 끝난 이전 요청
  assert.equal(p.has(k), true);
  p.finish(k, fresh);
  assert.equal(p.has(k), false);
});

test('createPending: 토큰 없이 finish하면 강제로 끝낸다(regenerated 이벤트)', () => {
  const p = view.createPending();
  const k = view.pendingKey('question', 3);
  p.start(k);
  p.finish(k);
  assert.equal(p.has(k), false);
});

test('canSubmitFollowup: 진행 중이거나 빈 질문이면 거부 (버그 3)', () => {
  assert.equal(view.canSubmitFollowup({ busy: false, text: '왜 중요해요?' }), true);
  assert.equal(view.canSubmitFollowup({ busy: true, text: '왜 중요해요?' }), false);
  assert.equal(view.canSubmitFollowup({ busy: false, text: '' }), false);
  assert.equal(view.canSubmitFollowup({ busy: false, text: '  \n ' }), false);
  assert.equal(view.canSubmitFollowup({ busy: false, text: null }), false);
});

test('invalidTarget: scope=followup이면 후속 질문 칸, 아니면 상단 (버그 4)', () => {
  assert.equal(view.invalidTarget({ type: 'invalid', scope: 'followup' }), 'followup');
  assert.equal(view.invalidTarget({ type: 'invalid' }), 'main');
  assert.equal(view.invalidTarget(null), 'main');
});

test('statementSourceIds: basis가 sourced인 문장만 출처를 표시한다', () => {
  assert.deepEqual(view.statementSourceIds({ basis: 'sourced', sourceIds: ['S1', 'S2'] }), ['S1', 'S2']);
  // 모델이 general로 표시했지만 출처 ID가 남은 경우(B의 schema에서 가능)는 일반 표현으로 보인다.
  assert.deepEqual(view.statementSourceIds({ basis: 'general', sourceIds: ['S1'] }), []);
  assert.deepEqual(view.statementSourceIds({ basis: 'sourced', sourceIds: [] }), []);
  assert.deepEqual(view.statementSourceIds({ sourceIds: ['S1'] }), []);
  assert.deepEqual(view.statementSourceIds(null), []);
});

test('statementSourceIds: 실제 schema 정규화 결과와 함께 써도 general 문장에는 출처가 붙지 않는다', () => {
  const { normalizeResult } = require('../../src/ai/schema');
  const sources = [{ id: 'S1', title: '테스트', extract: '테스트는 어떤 것의 성능을 확인하는 과정이다.' }];
  const r = normalizeResult({ statements: [
    { text: '테스트는 성능을 확인하는 과정이에요.', basis: 'general', sourceIds: ['S1'] },
    { text: '테스트는 성능을 확인하는 과정이래요.', basis: 'sourced', sourceIds: ['S1'] },
  ] }, sources);
  assert.equal(r.statements[0].basis, 'general');
  assert.deepEqual(view.statementSourceIds(r.statements[0]), []);
  assert.equal(r.statements[1].basis, 'sourced');
  assert.deepEqual(view.statementSourceIds(r.statements[1]), ['S1']);
});
