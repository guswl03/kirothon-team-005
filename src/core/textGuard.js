'use strict';
// 선택 텍스트 정규화·검증·중복 판별. 순수 함수라 테스트하기 쉽다.

const MAX_CHARS = 1500;
const MIN_CHARS = 2;

function normalize(text) {
  if (typeof text !== 'string') return '';
  return text
    // 제어문자 제거(탭/개행은 공백으로)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** @returns {{ok:true,text:string}|{ok:false,reason:'empty'|'too_short'|'too_long',message:string,length?:number}} */
function validateInput(raw, maxChars = MAX_CHARS) {
  const text = normalize(raw);
  if (!text) return { ok: false, reason: 'empty', message: '내용이 비어 있어 처리하지 않았어요.' };
  if (text.length < MIN_CHARS) {
    return { ok: false, reason: 'too_short', message: '두 글자 이상 선택해 주세요.' };
  }
  if (text.length > maxChars) {
    return {
      ok: false,
      reason: 'too_long',
      length: text.length,
      message: `선택한 내용이 너무 길어요(${text.length}자). ${maxChars}자 이하로 줄여 주세요.`,
    };
  }
  return { ok: true, text };
}

/** 동일 선택이 짧은 시간에 반복 실행되지 않도록 하는 중복 판별기 */
function createDedupe(windowMs = 4000, now = () => Date.now()) {
  let lastText = null;
  let lastAt = 0;
  return {
    shouldProcess(text) {
      const t = now();
      if (text === lastText && t - lastAt < windowMs) return false;
      lastText = text;
      lastAt = t;
      return true;
    },
    reset() {
      lastText = null;
      lastAt = 0;
    },
  };
}

module.exports = { MAX_CHARS, MIN_CHARS, normalize, validateInput, createDedupe };