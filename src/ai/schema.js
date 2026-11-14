'use strict';
// 모델 응답(JSON)을 검증·정규화한다. 모델이 만든 출처 표시는 신뢰하지 않고 검색 결과의 ID만 허용한다.

const TARGETS = { statements: 5, questions: 5, answersPerQuestion: 2, topicSwitches: 3 };

function str(v, max = 400) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// 문장 글자 2-gram 중 출처 본문에도 있는 비율이 이 값 미만이면 그 출처와의 연결을 끊는다.
// 한국어는 조사 때문에 단어 단위 비교가 잘 안 맞아서 글자 2-gram을 쓴다.
const SUPPORT_MIN = 0.3;

function bigrams(s) {
  const t = String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const out = new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** text의 2-gram 중 source 본문에 있는 비율(0~1). */
function supportScore(text, extract) {
  const a = bigrams(text);
  if (!a.size) return 0;
  const b = extract instanceof Set ? extract : bigrams(extract);
  let hit = 0;
  for (const g of a) if (b.has(g)) hit++;
  return hit / a.size;
}

/** 출처 ID 목록과 본문 2-gram 색인. 본문이 없는 출처는 내용 검증을 건너뛴다(ID 검증만). */
function sourceIndex(sources) {
  const ids = new Set();
  const grams = new Map();
  for (const s of sources) {
    if (!s || typeof s.id !== 'string') continue;
    ids.add(s.id);
    if (typeof s.extract === 'string' && s.extract.trim()) grams.set(s.id, bigrams(`${s.title || ''} ${s.extract}`));
  }
  return { has: (id) => ids.has(id), grams };
}

function sourceRefs(v, index, text) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x) => typeof x === 'string' && index.has(x)))]
    .filter((id) => !index.grams.has(id) || supportScore(text, index.grams.get(id)) >= SUPPORT_MIN);
}

function normalizeStatements(list, validIds) {
  if (!Array.isArray(list)) return [];
  return list.map((it) => (typeof it === 'string' ? { text: it } : it || {}))
    .map((it) => ({ text: str(it.text), basis: it.basis === 'sourced' ? 'sourced' : 'general', sourceIds: sourceRefs(it.sourceIds, validIds, str(it.text)) }))
    .map((it) => ({ ...it, basis: it.basis === 'sourced' && it.sourceIds.length ? 'sourced' : 'general' }))
    .filter((it) => it.text);
}

function normalizeQuestions(list, validIds) {
  if (!Array.isArray(list)) return [];
  return list.map((q) => {
    const answers = (Array.isArray(q && q.answers) ? q.answers : [])
      .map((a) => (typeof a === 'string' ? { text: a } : a || {}))
      .map((a) => ({ text: str(a.text), sourceIds: sourceRefs(a.sourceIds, validIds, str(a.text)) }))
      .filter((a) => a.text);
    return { question: str(q && q.question, 200), answers, estimated: true };
  }).filter((q) => q.question && q.answers.length);
}

function normalizeSwitches(list, validIds) {
  if (!Array.isArray(list)) return [];
  return list.map((s) => ({
    topic: str(s && s.topic, 80),
    line: str(s && s.line),
    sourceIds: sourceRefs(s && s.sourceIds, validIds, str(s && s.line)),
  })).filter((s) => s.topic && s.line);
}

/** @returns {{statements,questions,topicSwitches,keyFacts,topic,shortfalls:string[]}} */
function normalizeResult(raw, sources = []) {
  const validIds = sourceIndex(sources);
  const r = raw && typeof raw === 'object' ? raw : {};
  const statements = normalizeStatements(r.statements, validIds);
  const questions = normalizeQuestions(r.questions, validIds);
  const topicSwitches = normalizeSwitches(r.topicSwitches, validIds);
  const keyFacts = (Array.isArray(r.keyFacts) ? r.keyFacts : [])
    .map((f) => (typeof f === 'string' ? { text: f } : f || {}))
    .map((f) => ({ text: str(f.text), sourceIds: sourceRefs(f.sourceIds, validIds, str(f.text)) }))
    // 출처가 연결되지 않은 '사실'은 핵심 정보로 노출하지 않는다.
    .filter((f) => f.text && f.sourceIds.length);
  const shortfalls = [];
  if (statements.length < TARGETS.statements) shortfalls.push(`활용 문장 ${statements.length}/${TARGETS.statements}개`);
  if (questions.length < TARGETS.questions) shortfalls.push(`예상 질문 ${questions.length}/${TARGETS.questions}개`);
  if (questions.some((q) => q.answers.length < TARGETS.answersPerQuestion)) shortfalls.push('일부 질문의 답변이 2개 미만');
  if (topicSwitches.length < TARGETS.topicSwitches) shortfalls.push(`화제 전환 ${topicSwitches.length}/${TARGETS.topicSwitches}개`);
  return { topic: str(r.topic, 120), statements, questions, topicSwitches, keyFacts, shortfalls };
}

function normalizeAnswers(raw, sources = []) {
  const validIds = sourceIndex(sources);
  const r = raw && typeof raw === 'object' ? raw : {};
  const answers = (Array.isArray(r.answers) ? r.answers : [])
    .map((a) => (typeof a === 'string' ? { text: a } : a || {}))
    .map((a) => ({ text: str(a.text), sourceIds: sourceRefs(a.sourceIds, validIds, str(a.text)) }))
    .filter((a) => a.text);
  return { answers, insufficient: Boolean(r.insufficient) || answers.length === 0, note: str(r.note, 300) };
}

/** 모델이 코드블록/설명과 함께 JSON을 내놓아도 첫 번째 JSON 객체를 추출한다. */
function extractJson(text) {
  if (typeof text !== 'string') throw new Error('빈 응답');
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf('{');
  if (start < 0) throw new Error('JSON을 찾지 못했어요');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  throw new Error('JSON이 완성되지 않았어요');
}

module.exports = { TARGETS, SUPPORT_MIN, supportScore, normalizeResult, normalizeAnswers, extractJson };