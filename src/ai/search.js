'use strict';
// 위키백과 공개 API로 관련 정보를 수집한다. 출처명·링크·확인 시각을 항상 함께 반환한다.
// 검색 실패 시 사실을 만들어내지 않고 status로 상태를 알린다.

const UA = 'ConversationCheatsheet/0.1 (kirothon desktop app)';

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** 검색어로 쓰기 좋게 자른다(너무 긴 문장은 앞부분만). */
function toQuery(text, max = 80) {
  const t = String(text).replace(/[^\p{L}\p{N}\s.\-+#]/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).trim() : t;
}

function detectLang(text) {
  return /[\uAC00-\uD7A3]/.test(text) ? 'ko' : 'en';
}

async function getJson(fetchImpl, url, timeoutMs, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * @returns {Promise<{status:'ok'|'insufficient'|'failed', query:string, sources:Array, error?:string, retrievedAt:string}>}
 */
async function searchTopic(text, opts = {}) {
  const { fetchImpl = globalThis.fetch, limit = 3, timeoutMs = 8000, signal, now = () => new Date() } = opts;
  const query = opts.query || toQuery(text);
  const retrievedAt = now().toISOString();
  if (!query) return { status: 'insufficient', query, sources: [], retrievedAt };
  const lang = opts.lang || detectLang(query);
  try {
    const api = `https://${lang}.wikipedia.org/w/api.php`;
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', generator: 'search',
      gsrsearch: query, gsrlimit: String(limit), prop: 'extracts|info', exintro: '1',
      explaintext: '1', exlimit: String(limit), inprop: 'url', origin: '*',
    });
    const data = await getJson(fetchImpl, `${api}?${params}`, timeoutMs, signal);
    const pages = (data && data.query && data.query.pages) || [];
    const sources = pages
      .filter((p) => p && p.extract && p.extract.trim().length > 30)
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .slice(0, limit)
      .map((p, i) => ({
        id: `S${i + 1}`,
        name: `위키백과(${lang}) - ${stripHtml(p.title)}`,
        title: stripHtml(p.title),
        url: p.fullurl || `https://${lang}.wikipedia.org/?curid=${p.pageid}`,
        extract: p.extract.trim().slice(0, 1200),
        retrievedAt,
      }));
    return { status: sources.length ? 'ok' : 'insufficient', query, sources, retrievedAt };
  } catch (err) {
    if (err && err.name === 'AbortError' && signal && signal.aborted) throw err;
    return { status: 'failed', query, sources: [], retrievedAt, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = { searchTopic, toQuery, detectLang, stripHtml };