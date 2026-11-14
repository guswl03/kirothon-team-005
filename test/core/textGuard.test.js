'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInput, normalize, createDedupe, MAX_CHARS } = require('../../src/core/textGuard');

test('빈 입력과 공백만 있는 입력은 거부한다', () => {
  for (const v of ['', '   ', '\n\t', null, undefined, 42]) {
    const r = validateInput(v);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'empty');
  }
});

test('한 글자는 너무 짧다', () => assert.equal(validateInput('가').reason, 'too_short'));

test('너무 긴 입력은 길이와 함께 거부한다', () => {
  const r = validateInput('가'.repeat(MAX_CHARS + 1));
  assert.equal(r.reason, 'too_long');
  assert.equal(r.length, MAX_CHARS + 1);
});

test('제어문자 제거 및 공백 정규화', () => {
  assert.equal(normalize('  안녕\u0000  하세요\n\n반가워요\t '), '안녕 하세요 반가워요');
});

test('중복 방지: 같은 텍스트는 창 내에서 한 번만 처리', () => {
  let t = 1000;
  const d = createDedupe(4000, () => t);
  assert.equal(d.shouldProcess('양자 컴퓨터'), true);
  t += 1000;
  assert.equal(d.shouldProcess('양자 컴퓨터'), false);
  assert.equal(d.shouldProcess('블록체인'), true);
  t += 5000;
  assert.equal(d.shouldProcess('블록체인'), true);
});