'use strict';
// OpenAI 호환 Chat Completions 어댑터(선택). Kiro 직접 연동이 불가할 때의 대체 경로.
// 환경 변수: CHEAT_LLM_BASE_URL, CHEAT_LLM_API_KEY, CHEAT_LLM_MODEL

function createOpenAiProvider(opts = {}) {
  const baseUrl = (opts.baseUrl || process.env.CHEAT_LLM_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = opts.apiKey || process.env.CHEAT_LLM_API_KEY || '';
  const model = opts.model || process.env.CHEAT_LLM_MODEL || '';
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  return {
    id: 'openai',
    label: `OpenAI 호환(${model || '모델 미지정'})`,
    external: true,
    configured: Boolean(baseUrl && apiKey && model),
    async generate({ prompt, signal }) {
      if (!baseUrl || !apiKey || !model) throw new Error('CHEAT_LLM_BASE_URL / CHEAT_LLM_API_KEY / CHEAT_LLM_MODEL 설정이 필요해요.');
      if (!/^https:\/\//i.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl)) {
        throw new Error('CHEAT_LLM_BASE_URL은 https(또는 localhost)여야 해요.');
      }
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.8 }),
        signal,
      });
      if (!res.ok) throw new Error(`LLM 요청 실패(HTTP ${res.status})`);
      const data = await res.json();
      const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text) throw new Error('LLM 응답이 비어 있어요');
      return text;
    },
  };
}

module.exports = { createOpenAiProvider };