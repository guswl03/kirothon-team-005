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

// 검색어에서 뺄 흔한 말. 문장을 그대로 넣으면 위키백과 검색 결과가 비는 경우가 많다.
const STOPWORDS = new Set([
  '그리고', '그런데', '하지만', '그래서', '그러나', '또는', '정말', '진짜', '너무', '아주', '요즘', '최근', '오늘', '어제', '내일',
  '이번', '저번', '우리', '저희', '제가', '내가', '너는', '이거', '그거', '저거', '이것', '그것', '저것', '여기', '거기', '뭔가',
  '무엇', '어떤', '어떻게', '왜', '같은', '같아요', '있는', '없는', '있어요', '없어요', '했어요', '해요', '합니다', '했다', '한다',
  '하는', '하고', '하면', '해서', '대한', '대해', '관련', '때문에', '이다', '입니다', '있다', '없다', '된다', '되는', '라고', '이라고',
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'for', 'with', 'about',
  'this', 'that', 'it', 'its', 'i', 'you', 'we', 'they', 'he', 'she', 'what', 'how', 'why', 'do', 'does', 'did', 'so', 'just',
]);
// 긴 조사부터 떼어 낸다(예: '에서는' -> '에서' 보다 먼저).
const PARTICLES = ['에서는', '으로는', '에게서', '이라는', '라는', '에서', '으로', '에게', '한테', '까지', '부터', '처럼', '보다',
  '이랑', '하고', '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만', '랑'];

function stripParticle(word) {
  if (!/[\uAC00-\uD7A3]$/.test(word)) return word;
  for (const p of PARTICLES) {
    if (word.length - p.length >= 2 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  return word;
}

/** 문장에서 핵심 단어만 남긴 짧은 검색어를 만든다. 등장 순서를 유지하고 중복은 뺀다. */
function keywordQuery(text, maxWords = 4) {
  const words = toQuery(text, 400).split(' ')
    .map((w) => stripParticle(w))
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, maxWords).join(' ');
}

/** 영어 위키백과로 다시 찾을 때 쓸 라틴 문자 단어만 뽑는다. */
function latinQuery(text, maxWords = 4) {
  const words = toQuery(text, 400).split(' ')
    .filter((w) => /^[A-Za-z][A-Za-z0-9.+#-]*$/.test(w) && w.length >= 2 && !STOPWORDS.has(w.toLowerCase()));
  return [...new Set(words)].slice(0, maxWords).join(' ');
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

async function searchOnce(fetchImpl, lang, query, limit, timeoutMs, signal) {
  const api = `https://${lang}.wikipedia.org/w/api.php`;
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', generator: 'search',
    gsrsearch: query, gsrlimit: String(limit), prop: 'extracts|info', exintro: '1',
    explaintext: '1', exlimit: String(limit), inprop: 'url', origin: '*',
  });
  const data = await getJson(fetchImpl, `${api}?${params}`, timeoutMs, signal);
  const pages = (data && data.query && data.query.pages) || [];
  return pages
    .filter((p) => p && p.extract && p.extract.trim().length > 30)
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((p) => ({
      lang,
      title: stripHtml(p.title),
      url: p.fullurl || `https://${lang}.wikipedia.org/?curid=${p.pageid}`,
      extract: p.extract.trim().slice(0, 1200),
    }));
}

/** 시도할 (언어, 검색어) 순서: 원래 검색어 -> 핵심 단어 -> (한국어일 때) 영어 단어로 영어 위키백과. */
function searchPlan(text, opts) {
  const primary = opts.query || toQuery(text);
  const lang = opts.lang || detectLang(primary);
  const plan = [];
  const add = (l, q) => { if (q && !plan.some((p) => p.lang === l && p.query === q)) plan.push({ lang: l, query: q }); };
  add(lang, primary);
  if (!opts.query) add(lang, keywordQuery(text));
  if (!opts.lang && lang === 'ko') add('en', latinQuery(text));
  return { primary, plan };
}

/**
 * 결과가 부족하면 짧은 검색어와 영어 위키백과로 다시 찾는다. 네트워크 오류가 나면 더 시도하지 않는다.
 * @returns {Promise<{status:'ok'|'insufficient'|'failed', query:string, sources:Array, error?:string, retrievedAt:string, attempts?:string[]}>}
 */
async function searchTopic(text, opts = {}) {
  const { fetchImpl = globalThis.fetch, limit = 3, timeoutMs = 8000, signal, now = () => new Date() } = opts;
  const minSources = Math.min(opts.minSources || 2, limit);
  const retrievedAt = now().toISOString();
  const { primary, plan } = searchPlan(text, opts);
  if (!primary) return { status: 'insufficient', query: primary, sources: [], retrievedAt };
  const found = [];
  const attempts = [];
  let usedQuery = primary;
  for (const step of plan) {
    attempts.push(`${step.lang}:${step.query}`);
    let pages;
    try {
      pages = await searchOnce(fetchImpl, step.lang, step.query, limit, timeoutMs, signal);
    } catch (err) {
      if (err && err.name === 'AbortError' && signal && signal.aborted) throw err;
      if (found.length) break; // 이미 찾은 결과는 살린다
      return { status: 'failed', query: primary, sources: [], retrievedAt, attempts, error: err && err.message ? err.message : String(err) };
    }
    const before = found.length;
    for (const p of pages) if (found.length < limit && !found.some((f) => f.url === p.url)) found.push(p);
    if (!before && found.length) usedQuery = step.query;
    if (found.length >= minSources) break;
  }
  const sources = found.map((p, i) => ({
    id: `S${i + 1}`,
    name: `위키백과(${p.lang}) - ${p.title}`,
    title: p.title,
    url: p.url,
    extract: p.extract,
    retrievedAt,
  }));
  return { status: sources.length ? 'ok' : 'insufficient', query: usedQuery, sources, retrievedAt, attempts };
}

module.exports = { searchTopic, toQuery, detectLang, stripHtml, keywordQuery, latinQuery };