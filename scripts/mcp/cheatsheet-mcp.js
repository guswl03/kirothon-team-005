#!/usr/bin/env node
'use strict';
// 대화 치트키 개발용 MCP 서버(stdio, 의존성 없음). Kiro가 앱의 실제 모듈로 검색·프롬프트·출처 검증을 바로 실행하게 한다.
// 프로토콜: 줄 단위 JSON-RPC 2.0 (initialize, tools/list, tools/call, ping).
// stdout은 프로토콜 전용이다. 로그는 stderr로만 쓴다. 선택 텍스트나 결과를 파일에 저장하지 않는다.
const readline = require('node:readline');
const { searchTopic, keywordQuery } = require('../../src/ai/search');
const prompt = require('../../src/ai/prompt');
const { normalizeResult, normalizeAnswers, extractJson, supportScore, SUPPORT_MIN } = require('../../src/ai/schema');
const hooks = require('../hooks/lib');

const SERVER = { name: 'cheatsheet-dev', version: '0.1.0' };
const DEFAULT_PROTOCOL = '2025-06-18';

const str = (v, max = 1500) => (typeof v === 'string' ? v.slice(0, max) : '');
const tone = (v) => prompt.toneOf(v);
const parseMaybeJson = (v) => (typeof v === 'string' ? extractJson(v) : v);
const brief = (s) => ({ id: s.id, name: s.name, url: s.url, retrievedAt: s.retrievedAt, extract: String(s.extract || '').slice(0, 300) });

const TOOLS = [
  {
    name: 'wiki_search',
    description: '앱과 같은 방식(원래 검색어 -> 핵심 단어 -> 영어 위키백과)으로 위키백과를 검색해 상태, 사용한 검색어, 시도 순서, 출처를 돌려준다.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: '선택 텍스트(최대 1500자)' }, note: { type: 'string', description: '사용자 맥락(선택)' } }, required: ['text'] },
    async run({ text, note }) {
      const t = str(text);
      const r = await searchTopic(note ? `${t} ${str(note, 300)}` : t);
      return { status: r.status, query: r.query, keywordQuery: keywordQuery(t), attempts: r.attempts, error: r.error, sources: r.sources.map(brief) };
    },
  },
  {
    name: 'build_prompt',
    description: '앱이 모델에 보내는 프롬프트를 그대로 만든다. kind는 full(기본) | followup | statement | question | switch. sources를 주지 않으면 출처 없이 만든다.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' }, tone: { type: 'string', enum: ['casual', 'work'] }, note: { type: 'string' }, direction: { type: 'string' },
        kind: { type: 'string', enum: ['full', 'followup', 'statement', 'question', 'switch'] }, question: { type: 'string' },
        sources: { type: 'array', items: { type: 'object' } },
      },
      required: ['text'],
    },
    async run(a) {
      const ctx = { text: str(a.text), tone: tone(a.tone), note: str(a.note, 300), direction: str(a.direction, 80), sources: Array.isArray(a.sources) ? a.sources : [] };
      const kind = a.kind || 'full';
      const text = kind === 'full' ? prompt.buildFullPrompt(ctx)
        : kind === 'followup' ? prompt.buildFollowupPrompt(ctx, str(a.question, 300), '')
          : prompt.buildRegeneratePrompt(ctx, kind, []);
      return { kind, chars: text.length, prompt: text };
    },
  },
  {
    name: 'verify_result',
    description: '모델 응답(JSON 객체 또는 문자열)을 앱의 스키마로 정규화한다. 검색 결과에 없거나 본문과 맞지 않는 출처를 제거한 결과, 강등된 항목 수, 목표 개수 부족(shortfalls)을 돌려준다.',
    inputSchema: {
      type: 'object',
      properties: { result: { description: '모델 응답 JSON 또는 문자열' }, sources: { type: 'array', items: { type: 'object' } }, followup: { type: 'boolean' } },
      required: ['result'],
    },
    async run({ result, sources = [], followup = false }) {
      const raw = parseMaybeJson(result);
      if (followup) return normalizeAnswers(raw, sources);
      const r = normalizeResult(raw, sources);
      const claimed = (Array.isArray(raw && raw.statements) ? raw.statements : []).filter((s) => s && s.basis === 'sourced').length;
      const kept = r.statements.filter((s) => s.basis === 'sourced').length;
      return { ...r, demotedStatements: Math.max(0, claimed - kept), supportMin: SUPPORT_MIN };
    },
  },
  {
    name: 'support_score',
    description: '문장이 출처 본문에 얼마나 뒷받침되는지(글자 2-gram 겹침 비율, 0~1)와 앱 기준(SUPPORT_MIN) 통과 여부를 돌려준다.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, extract: { type: 'string' } }, required: ['text', 'extract'] },
    async run({ text, extract }) {
      const score = supportScore(str(text, 400), str(extract, 5000));
      return { score: Number(score.toFixed(3)), supportMin: SUPPORT_MIN, passes: score >= SUPPORT_MIN };
    },
  },
  {
    name: 'project_status',
    description: '현재 브랜치와 역할, 소유 디렉터리, 남은 spec 작업을 돌려준다. runChecks가 true면 전체 단위 테스트와 보안 정적 점검도 실행한다.',
    inputSchema: { type: 'object', properties: { runChecks: { type: 'boolean' } } },
    async run({ runChecks = false } = {}) {
      const branch = hooks.currentBranch();
      const out = { branch, role: hooks.ROLES[branch] || null, pendingSpecTasks: hooks.pendingSpecTasks() };
      if (runChecks) {
        const t = hooks.runNodeTests(['test/**/*.test.js']);
        const c = hooks.runCheck();
        out.tests = { ok: t.ok, pass: t.pass, total: t.tests, failures: t.failures };
        out.securityCheck = { ok: c.ok, output: c.output };
      }
      return out;
    },
  },
];

function reply(id, result) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`); }
function fail(id, code, message) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`); }

async function handle(msg) {
  const { id, method, params = {} } = msg || {};
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case 'initialize':
      return reply(id, { protocolVersion: params.protocolVersion || DEFAULT_PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER });
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, `알 수 없는 도구: ${params.name}`);
      try {
        const data = await tool.run(params.arguments || {});
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data });
      } catch (e) {
        return reply(id, { content: [{ type: 'text', text: `오류: ${(e && e.message) || e}` }], isError: true });
      }
    }
    default:
      if (isRequest) return fail(id, -32601, `지원하지 않는 메서드: ${method}`);
      return undefined; // notifications/initialized 등 알림은 응답하지 않는다
  }
}

if (require.main === module) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return fail(null, -32700, 'JSON 파싱 오류'); }
    handle(msg).catch((e) => process.stderr.write(`[cheatsheet-mcp] ${(e && e.message) || e}\n`));
  });
}

module.exports = { TOOLS };
