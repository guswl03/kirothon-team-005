'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { searchTopic, toQuery, detectLang } = require('../../src/ai/search');

const okFetch = (pages) => async (url) => ({ ok: true, json: async () => ({ query: { pages } }), url });

test('출처명·링크·확인 시각을 포함해 반환한다', async () => {
  const now = () => new Date('2026-11-14T00:00:00Z');
  const r = await searchTopic('양자 컴퓨터', { now, fetchImpl: okFetch([{ title: '양자 컴퓨터', index: 1, pageid: 1, fullurl: 'https://ko.wikipedia.org/wiki/x', extract: '양자 컴퓨터는 양자역학을 이용하는 컴퓨터이다. 충분히 긴 설명 문장입니다.' }]) });
  assert.equal(r.status, 'ok');
  assert.equal(r.sources[0].url, 'https://ko.wikipedia.org/wiki/x');
  assert.equal(r.sources[0].retrievedAt, '2026-11-14T00:00:00.000Z');
  assert.match(r.sources[0].name, /위키백과/);
});

test('결과가 없으면 insufficient (사실을 만들지 않는다)', async () => {
  const r = await searchTopic('zzzz', { fetchImpl: okFetch([]) });
  assert.equal(r.status, 'insufficient');
  assert.deepEqual(r.sources, []);
});

test('네트워크 오류는 failed 상태와 오류 메시지로 알린다', async () => {
  const r = await searchTopic('주제', { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'offline');
  assert.deepEqual(r.sources, []);
});

test('HTTP 오류도 failed', async () => {
  const r = await searchTopic('주제', { fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(r.status, 'failed');
});

test('toQuery / detectLang', () => {
  assert.equal(toQuery('  hello,   world!!  '), 'hello world');
  assert.equal(toQuery('가'.repeat(200)).length, 80);
  assert.equal(detectLang('안녕'), 'ko');
  assert.equal(detectLang('hello'), 'en');
});