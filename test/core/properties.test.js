'use strict';
// 설계 문서의 정확성 속성을 무작위 입력으로 검증한다(외부 라이브러리 없는 간단한 속성 기반 테스트).
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInput, MAX_CHARS } = require('../../src/core/textGuard');
const { normalizeResult } = require('../../src/ai/schema');
const { placeWindow } = require('../../src/main/windowPlacement');

let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const ri = (n) => Math.floor(rnd() * n);
const pick = (a) => a[ri(a.length)];
const randStr = () => Array.from({ length: ri(40) }, () => pick(['가', 'a', ' ', '\n', '\t', '\u0000', '.', '😀'])).join('');

test('P1: validateInput이 ok이면 비어 있지 않고 길이 제한 이내', () => {
  for (let i = 0; i < 500; i++) {
    const s = rnd() < 0.05 ? '가'.repeat(MAX_CHARS + ri(5)) : randStr();
    const r = validateInput(s);
    if (r.ok) { assert.ok(r.text.length > 0 && r.text.length <= MAX_CHARS); assert.ok(!/[\u0000-\u001F]/.test(r.text)); }
  }
});

test('P2/P3: 정규화 결과의 sourceIds는 항상 유효한 출처의 부분집합, 출처 없으면 sourced 불가', () => {
  const sources = [{ id: 'S1' }, { id: 'S2' }];
  const valid = new Set(['S1', 'S2']);
  const ids = () => Array.from({ length: ri(4) }, () => pick(['S1', 'S2', 'S3', 'x', 7, null]));
  for (let i = 0; i < 300; i++) {
    const raw = {
      statements: Array.from({ length: ri(6) }, () => ({ text: randStr() || 'a', basis: pick(['sourced', 'general', 'x']), sourceIds: ids() })),
      questions: Array.from({ length: ri(4) }, () => ({ question: 'q', answers: [{ text: 'a', sourceIds: ids() }] })),
      topicSwitches: Array.from({ length: ri(4) }, () => ({ topic: 't', line: 'l', sourceIds: ids() })),
      keyFacts: Array.from({ length: ri(4) }, () => ({ text: 'f', sourceIds: ids() })),
    };
    const r = normalizeResult(raw, sources);
    const all = [...r.statements, ...r.topicSwitches, ...r.keyFacts, ...r.questions.flatMap((q) => q.answers)];
    for (const it of all) it.sourceIds.forEach((id) => assert.ok(valid.has(id)));
    r.statements.forEach((s) => { if (s.basis === 'sourced') assert.ok(s.sourceIds.length > 0); });
    r.keyFacts.forEach((f) => assert.ok(f.sourceIds.length > 0));
  }
});

test('P5: 창 위치는 어떤 커서 위치에서도 작업 영역 안', () => {
  for (let i = 0; i < 500; i++) {
    const area = { x: ri(200) - 100, y: ri(100), width: 800 + ri(2000), height: 600 + ri(1000) };
    const size = { width: Math.min(300 + ri(200), area.width), height: Math.min(400 + ri(300), area.height) }; // main.js와 동일하게 작업 영역 이내로 제한
    const c = { x: area.x + ri(area.width), y: area.y + ri(area.height) };
    const p = placeWindow(c, size, area);
    assert.ok(p.x >= area.x && p.y >= area.y && p.x + size.width <= area.x + area.width && p.y + size.height <= area.y + area.height);
  }
});