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

const { keywordQuery, latinQuery } = require('../../src/ai/search');

const page = (title, lang = 'ko') => ({ title, index: 1, pageid: title.length, fullurl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`, extract: `${title}에 대한 충분히 긴 설명 문장입니다. 이 문장은 서른 자를 넘깁니다.` });

/** 요청 URL의 언어·검색어를 기록하고, 검색어별로 정해 둔 결과를 돌려준다. */
function routedFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    const u = new URL(url);
    const lang = u.hostname.split('.')[0];
    const q = u.searchParams.get('gsrsearch');
    calls.push(`${lang}:${q}`);
    const r = routes[`${lang}:${q}`];
    if (r instanceof Error) throw r;
    return { ok: true, json: async () => ({ query: { pages: r || [] } }) };
  };
  fn.calls = calls;
  return fn;
}

test('keywordQuery: 조사와 흔한 말을 빼고 핵심 단어만 남긴다', () => {
  assert.equal(keywordQuery('요즘 회사에서는 생성형 AI를 업무에 정말 많이 쓰더라고요'), '회사 생성형 AI 업무');
  assert.equal(keywordQuery('양자 컴퓨터가 양자 컴퓨터를'), '양자 컴퓨터');
  assert.equal(latinQuery('쿠버네티스 Kubernetes 클러스터 the Helm 차트'), 'Kubernetes Helm');
});

test('원래 검색어로 결과가 없으면 핵심 단어로 다시 찾는다', async () => {
  const text = '요즘 회사에서는 생성형 AI를 업무에 정말 많이 쓰더라고요';
  const fetchImpl = routedFetch({ 'ko:회사 생성형 AI 업무': [page('생성형 인공지능')] });
  const r = await searchTopic(text, { fetchImpl });
  assert.equal(r.status, 'ok');
  assert.equal(r.query, '회사 생성형 AI 업무');
  assert.equal(fetchImpl.calls[0], `ko:${toQuery(text)}`);
  assert.equal(r.sources[0].id, 'S1');
});

test('한국어 결과가 없으면 영어 단어로 영어 위키백과를 찾는다', async () => {
  const fetchImpl = routedFetch({ 'en:Kubernetes': [page('Kubernetes', 'en')] });
  const r = await searchTopic('쿠버네티스 Kubernetes 써 보셨어요', { fetchImpl });
  assert.equal(r.status, 'ok');
  assert.deepEqual(fetchImpl.calls.map((c) => c.split(':')[0]), ['ko', 'ko', 'en']);
  assert.match(r.sources[0].name, /위키백과\(en\)/);
});

test('결과가 부족하면 다음 검색어 결과를 중복 없이 합친다', async () => {
  const text = '요즘 생성형 AI 얘기';
  const first = toQuery(text);
  const fetchImpl = routedFetch({ [`ko:${first}`]: [page('생성형 인공지능')], 'ko:생성형 AI 얘기': [page('생성형 인공지능'), page('대형 언어 모델')] });
  const r = await searchTopic(text, { fetchImpl });
  assert.deepEqual(r.sources.map((s) => s.id), ['S1', 'S2']);
  assert.deepEqual(r.sources.map((s) => s.title), ['생성형 인공지능', '대형 언어 모델']);
});

test('첫 요청이 네트워크 오류면 더 시도하지 않고 failed', async () => {
  const fetchImpl = routedFetch({ [`ko:${toQuery('요즘 생성형 AI 얘기')}`]: new Error('offline') });
  const r = await searchTopic('요즘 생성형 AI 얘기', { fetchImpl });
  assert.equal(r.status, 'failed');
  assert.equal(fetchImpl.calls.length, 1);
});

test('이미 찾은 결과가 있으면 뒤 단계 오류에도 결과를 살린다', async () => {
  const text = '요즘 생성형 AI 얘기';
  const fetchImpl = routedFetch({ [`ko:${toQuery(text)}`]: [page('생성형 인공지능')], 'ko:생성형 AI 얘기': new Error('503') });
  const r = await searchTopic(text, { fetchImpl });
  assert.equal(r.status, 'ok');
  assert.equal(r.sources.length, 1);
});

test('사용자가 취소하면 AbortError를 그대로 던진다', async () => {
  const ctrl = new AbortController();
  const fetchImpl = async () => { ctrl.abort(); const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  await assert.rejects(searchTopic('주제', { fetchImpl, signal: ctrl.signal }), { name: 'AbortError' });
});
