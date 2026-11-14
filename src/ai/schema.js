'use strict';
// 모델 응답(JSON)을 검증·정규화한다. 모델이 만든 출처 표시는 신뢰하지 않고 검색 결과의 ID만 허용한다.

const TARGETS = { statements: 5, questions: 5, answersPerQuestion: 2, topicSwitches: 3 };

function str(v, max = 400) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function sourceRefs(v, validIds) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x) => typeof x === 'string' && validIds.has(x)))];
}

function normalizeStatements(list, validIds) {
  if (!Array.isArray(list)) return [];
  return list.map((it) => (typeof it === 'string' ? { text: it } : it || {}))
    .map((it) => ({ text: str(it.text), basis: it.basis === 'sourced' ? 'sourced' : 'general', sourceIds: sourceRefs(it.sourceIds, validIds) }))
    .map((it) => ({ ...it, basis: it.basis === 'sourced' && it.sourceIds.length ? 'sourced' : 'general' }))
    .filter((it) => it.text);
}

function normalizeQuestions(list, validIds) {
  if (!Array.isArray(list)) return [];
  return list.map((q) => {
    const answers = (Array.isArray(q && q.answers) ? q.answers : [])
      .map((a) => (typeof a === 'string' ? { text: a } : a || {}))
      .map((a) => ({ text: str(a.text), sourceIds: sourceRefs(a.sourceIds, validIds) }))
      .filter((a) => a.text);
    return { question: str(q && q.question, 200), answers, estimated: true };
  }).filter((q) => q.question && q.answers.length);
}

function normalizeSwitches(list, validIds) {
  if (!Array.isArray(list)) return [];
  return list.map((s) => ({
    topic: str(s && s.topic, 80),
    line: str(s && s.line),
    sourceIds: sourceRefs(s && s.sourceIds, validIds),
  })).filter((s) => s.topic && s.line);
}

/** @returns {{statements,questions,topicSwitches,keyFacts,topic,shortfalls:string[]}} */
function normalizeResult(raw, sources = []) {
  const validIds = new Set(sources.map((s) => s.id));
  const r = raw && typeof raw === 'object' ? raw : {};
  const statements = normalizeStatements(r.statements, validIds);
  const questions = normalizeQuestions(r.questions, validIds);
  const topicSwitches = normalizeSwitches(r.topicSwitches, validIds);
  const keyFacts = (Array.isArray(r.keyFacts) ? r.keyFacts : [])
    .map((f) => (typeof f === 'string' ? { text: f } : f || {}))
    .map((f) => ({ text: str(f.text), sourceIds: sourceRefs(f.sourceIds, validIds) }))
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
  const validIds = new Set(sources.map((s) => s.id));
  const r = raw && typeof raw === 'object' ? raw : {};
  const answers = (Array.isArray(r.answers) ? r.answers : [])
    .map((a) => (typeof a === 'string' ? { text: a } : a || {}))
    .map((a) => ({ text: str(a.text), sourceIds: sourceRefs(a.sourceIds, validIds) }))
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

module.exports = { TARGETS, normalizeResult, normalizeAnswers, extractJson };