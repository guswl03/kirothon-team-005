'use strict';
// 설정만 저장한다. 선택 텍스트·생성 결과는 디스크에 저장하지 않는다.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = { autoAnalyze: false, consentAccepted: false, consentProvider: '', tone: 'casual', provider: 'auto' };
// 예전 설정 파일의 'offline'은 sanitize에서 'auto'로 바뀐다.
const PROVIDERS = ['auto', 'kiro', 'openai'];
// 동의할 때 안내한 실제 공급자 id. 다른 공급자로 바뀌면 다시 동의를 받는다. 예전 설정(값 없음)은 다시 동의 대상이다.
const CONSENT_PROVIDERS = ['kiro', 'openai'];

function sanitize(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  return {
    autoAnalyze: o.autoAnalyze === true,
    consentAccepted: o.consentAccepted === true,
    consentProvider: CONSENT_PROVIDERS.includes(o.consentProvider) ? o.consentProvider : '',
    tone: o.tone === 'work' ? 'work' : 'casual',
    provider: PROVIDERS.includes(o.provider) ? o.provider : 'auto',
  };
}

function createSettings(dir) {
  const file = path.join(dir, 'settings.json');
  let data = { ...DEFAULTS };
  try { data = sanitize(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { /* 최초 실행 */ }
  return {
    get: () => ({ ...data }),
    set(patch) {
      data = sanitize({ ...data, ...patch });
      try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch { /* 저장 실패는 무시 */ }
      return { ...data };
    },
  };
}

/** 지금 쓰일 공급자(providerId)에 대해 동의를 받은 적이 없으면 true */
function needsConsent(s, providerId) {
  return !(s && s.consentAccepted === true && s.consentProvider && s.consentProvider === providerId);
}

module.exports = { createSettings, sanitize, needsConsent, DEFAULTS, PROVIDERS };