'use strict';
// 설정만 저장한다. 선택 텍스트·생성 결과는 디스크에 저장하지 않는다.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = { autoAnalyze: false, consentAccepted: false, tone: 'casual', provider: 'auto' };
// 예전 설정 파일의 'offline'은 sanitize에서 'auto'로 바뀐다.
const PROVIDERS = ['auto', 'kiro', 'openai'];

function sanitize(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  return {
    autoAnalyze: o.autoAnalyze === true,
    consentAccepted: o.consentAccepted === true,
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

module.exports = { createSettings, sanitize, DEFAULTS, PROVIDERS };