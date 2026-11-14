'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { placeWindow } = require('../../src/main/windowPlacement');
const { sanitize, createSettings } = require('../../src/main/settings');
const { parseLine } = require('../../src/main/selectionWatcher');
const { makeIconPng } = require('../../src/main/icon');

const area = { x: 0, y: 0, width: 1920, height: 1040 };
const size = { width: 440, height: 700 };

test('창 위치: 항상 작업 영역 안에 들어온다', () => {
  for (const c of [{ x: 0, y: 0 }, { x: 1919, y: 1039 }, { x: 1900, y: 10 }, { x: 10, y: 1030 }, { x: 960, y: 500 }]) {
    const p = placeWindow(c, size, area);
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + size.width <= 1920 && p.y + size.height <= 1040, JSON.stringify([c, p]));
  }
});

test('설정: 알 수 없는 값은 기본값으로 정리하고, 동의는 명시적 true만 인정', () => {
  assert.deepEqual(sanitize({ autoAnalyze: 'yes', consentAccepted: 1, tone: 'x', provider: 'evil' }),
    { autoAnalyze: false, consentAccepted: false, tone: 'casual', provider: 'auto' });
  assert.equal(sanitize(null).tone, 'casual');
});

test('설정: 없어진 오프라인 공급자를 저장한 예전 설정은 auto로 바뀐다', () => {
  assert.equal(sanitize({ provider: 'offline' }).provider, 'auto');
  assert.equal(sanitize({ provider: 'kiro' }).provider, 'kiro');
});

test('설정 저장: 선택 텍스트 같은 다른 필드는 저장하지 않는다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'));
  const s = createSettings(dir);
  s.set({ tone: 'work', text: '비밀 텍스트', selected: 'x' });
  const raw = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8');
  assert.ok(!raw.includes('비밀'));
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['autoAnalyze', 'consentAccepted', 'provider', 'tone']);
  assert.equal(createSettings(dir).get().tone, 'work');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('선택 감지 헬퍼 출력 파싱', () => {
  assert.deepEqual(parseLine('{"text":"안녕","pid":12}'), { text: '안녕', pid: 12 });
  assert.equal(parseLine('not json'), null);
  assert.equal(parseLine('{"pid":1}'), null);
});

test('아이콘 PNG 시그니처', () => {
  assert.deepEqual([...makeIconPng(16).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});