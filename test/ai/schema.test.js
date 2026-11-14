'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeResult, normalizeAnswers, extractJson } = require('../../src/ai/schema');

const sources = [{ id: 'S1' }, { id: 'S2' }];

test('extractJson: 코드블록·설명이 섞여도 JSON을 추출한다', () => {
  assert.deepEqual(extractJson('설명\n```json\n{"a":{"b":"}"}}\n```\n끝'), { a: { b: '}' } });
  assert.deepEqual(extractJson('앞말 {"x":1} 뒷말'), { x: 1 });
  assert.throws(() => extractJson('JSON 없음'));
  assert.throws(() => extractJson('{"a":'));
});

test('모델이 만든 가짜 출처 ID는 제거하고 basis를 general로 낮춘다', () => {
  const r = normalizeResult({ statements: [{ text: '문장', basis: 'sourced', sourceIds: ['S9'] }] }, sources);
  assert.equal(r.statements[0].basis, 'general');
  assert.deepEqual(r.statements[0].sourceIds, []);
});

test('유효한 출처 ID는 유지한다', () => {
  const r = normalizeResult({ statements: [{ text: '문장', basis: 'sourced', sourceIds: ['S1', 'S1', 'x'] }] }, sources);
  assert.equal(r.statements[0].basis, 'sourced');
  assert.deepEqual(r.statements[0].sourceIds, ['S1']);
});

test('출처 없는 keyFacts는 노출하지 않는다', () => {
  const r = normalizeResult({ keyFacts: [{ text: '사실', sourceIds: [] }, { text: '확인', sourceIds: ['S2'] }] }, sources);
  assert.equal(r.keyFacts.length, 1);
});

test('예상 질문은 항상 AI 추정(estimated)으로 표시하고, 답변 없는 질문은 제외한다', () => {
  const r = normalizeResult({ questions: [{ question: 'Q1', answers: [{ text: 'A' }] }, { question: 'Q2', answers: [] }] }, sources);
  assert.equal(r.questions.length, 1);
  assert.equal(r.questions[0].estimated, true);
});

test('목표 개수에 못 미치면 shortfalls로 알리고 채우지 않는다', () => {
  const r = normalizeResult({ statements: [{ text: 'a' }] }, sources);
  assert.equal(r.statements.length, 1);
  assert.ok(r.shortfalls.length >= 3);
});

test('잘못된 입력에도 예외 없이 빈 결과를 돌려준다', () => {
  for (const bad of [null, undefined, 'x', 3, { statements: 'x', questions: {} }]) {
    const r = normalizeResult(bad, sources);
    assert.equal(r.statements.length, 0);
  }
});

test('후속 답변: 비어 있으면 insufficient', () => {
  assert.equal(normalizeAnswers({ answers: [] }).insufficient, true);
  assert.equal(normalizeAnswers({ answers: [{ text: '답' }] }).insufficient, false);
});

const { supportScore, SUPPORT_MIN } = require('../../src/ai/schema');
const { createOfflineProvider } = require('../../src/ai/providers/offline');

const realSources = [
  { id: 'S1', title: '양자 컴퓨터', extract: '양자 컴퓨터는 양자역학의 중첩과 얽힘을 이용해 계산하는 컴퓨터이다. 특정 문제에서 기존 컴퓨터보다 빠를 수 있다.' },
  { id: 'S2', title: '비트코인', extract: '비트코인은 2009년에 공개된 암호화폐이다. 블록체인 기술을 기반으로 한다.' },
];

test('supportScore: 출처와 겹치는 문장은 높고 무관한 문장은 낮다', () => {
  assert.ok(supportScore('양자 컴퓨터는 중첩과 얽힘을 써서 계산한대요.', realSources[0].extract) >= SUPPORT_MIN);
  assert.ok(supportScore('올해 프로야구 우승팀은 어디일까요?', realSources[0].extract) < SUPPORT_MIN);
  assert.equal(supportScore('', 'x'), 0);
});

test('내용이 출처와 맞지 않으면 출처 연결을 끊고 general로 낮춘다', () => {
  const r = normalizeResult({
    statements: [
      { text: '양자 컴퓨터는 중첩과 얽힘을 이용해서 계산한대요.', basis: 'sourced', sourceIds: ['S1'] },
      { text: '양자 컴퓨터는 2009년에 처음으로 상용화되었다고 하더라고요.', basis: 'sourced', sourceIds: ['S2'] },
      { text: '프로야구 결승전 표가 매진됐대요.', basis: 'sourced', sourceIds: ['S1'] },
    ],
  }, realSources);
  assert.deepEqual(r.statements.map((s) => s.basis), ['sourced', 'general', 'general']);
  assert.deepEqual(r.statements[2].sourceIds, []);
});

test('여러 출처 중 실제로 뒷받침하는 출처만 남긴다', () => {
  const r = normalizeResult({ keyFacts: [{ text: '비트코인은 블록체인 기술을 기반으로 한 암호화폐다', sourceIds: ['S1', 'S2'] }] }, realSources);
  assert.deepEqual(r.keyFacts[0].sourceIds, ['S2']);
});

test('뒷받침되지 않는 핵심 정보와 후속 답변 출처는 제거한다', () => {
  const r = normalizeResult({ keyFacts: [{ text: '화성에는 도시가 세 곳 있다', sourceIds: ['S1'] }] }, realSources);
  assert.equal(r.keyFacts.length, 0);
  const a = normalizeAnswers({ answers: [{ text: '화성에는 도시가 세 곳 있어요', sourceIds: ['S1'] }] }, realSources);
  assert.deepEqual(a.answers[0].sourceIds, []);
});

test('오프라인 간이 모드의 인용 문장은 검증에서 강등되지 않는다', async () => {
  for (const tone of ['casual', 'work']) {
    const raw = await createOfflineProvider().generate({ ctx: { text: '양자 컴퓨터', tone, sources: realSources }, kind: 'full' });
    const r = normalizeResult(JSON.parse(raw), realSources);
    const sourced = r.statements.filter((s) => s.basis === 'sourced');
    assert.equal(sourced.length, 3, tone);
    assert.equal(r.keyFacts.length, 3, tone);
  }
});
