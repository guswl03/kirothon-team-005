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