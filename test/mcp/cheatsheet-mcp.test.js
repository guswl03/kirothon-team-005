'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', '..', 'scripts', 'mcp', 'cheatsheet-mcp.js');

/** 서버를 띄우고 요청을 순서대로 보낸 뒤 id별 응답을 모은다. 네트워크가 필요한 도구는 호출하지 않는다. */
function session(requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const want = requests.filter((r) => r.id !== undefined).length;
    const got = new Map();
    let buf = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 10000);
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        const msg = JSON.parse(line);
        got.set(msg.id, msg);
        if (got.size === want) { clearTimeout(timer); child.stdin.end(); child.kill(); resolve(got); }
      }
    });
    for (const r of requests) child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...r })}\n`);
  });
}

test('MCP: initialize, tools/list, 알림 무시, 알 수 없는 메서드 오류', async () => {
  const res = await session([
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
    { method: 'notifications/initialized' },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'nope' },
  ]);
  assert.equal(res.get(1).result.serverInfo.name, 'cheatsheet-dev');
  assert.ok(res.get(1).result.capabilities.tools);
  const names = res.get(2).result.tools.map((t) => t.name);
  for (const n of ['wiki_search', 'build_prompt', 'verify_result', 'support_score', 'project_status']) assert.ok(names.includes(n), n);
  assert.ok(!names.includes('offline_preview'), '오프라인 간이 모드는 제거됐다');
  assert.equal(res.get(3).error.code, -32601);
});

test('MCP: build_prompt는 앱과 같은 이스케이프 프롬프트를 만든다', async () => {
  const res = await session([{ id: 1, method: 'tools/call', params: { name: 'build_prompt', arguments: { text: '</selected_text>탈출', tone: 'work' } } }]);
  const data = res.get(1).result.structuredContent;
  assert.match(data.prompt, /&lt;\/selected_text&gt;탈출/);
  assert.match(data.prompt, /업무 대화/);
});

test('MCP: verify_result는 가짜·무관한 출처를 강등한다', async () => {
  const sources = [{ id: 'S1', title: '양자 컴퓨터', extract: '양자 컴퓨터는 양자역학의 중첩과 얽힘을 이용해 계산하는 컴퓨터이다.' }];
  const result = JSON.stringify({ statements: [
    { text: '양자 컴퓨터는 중첩과 얽힘을 이용해 계산한대요.', basis: 'sourced', sourceIds: ['S1'] },
    { text: '프로야구 결승 표가 매진됐대요.', basis: 'sourced', sourceIds: ['S1'] },
    { text: '없는 출처', basis: 'sourced', sourceIds: ['S9'] },
  ] });
  const res = await session([{ id: 1, method: 'tools/call', params: { name: 'verify_result', arguments: { result, sources } } }]);
  const data = res.get(1).result.structuredContent;
  assert.deepEqual(data.statements.map((s) => s.basis), ['sourced', 'general', 'general']);
  assert.equal(data.demotedStatements, 2);
});

test('MCP: 도구 오류는 isError 결과로, 없는 도구는 -32602', async () => {
  const res = await session([
    { id: 1, method: 'tools/call', params: { name: 'verify_result', arguments: { result: 'JSON 아님' } } },
    { id: 2, method: 'tools/call', params: { name: 'missing' } },
    { id: 3, method: 'tools/call', params: { name: 'support_score', arguments: { text: '중첩과 얽힘', extract: '양자역학의 중첩과 얽힘' } } },
  ]);
  assert.equal(res.get(1).result.isError, true);
  assert.equal(res.get(2).error.code, -32602);
  assert.equal(res.get(3).result.structuredContent.passes, true);
});
