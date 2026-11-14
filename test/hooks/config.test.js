'use strict';
// .kiro 설정 파일이 형식에 맞고, 참조하는 스크립트·파일이 실제로 있는지 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const KIRO = path.join(ROOT, '.kiro');
const list = (dir, re) => fs.readdirSync(path.join(KIRO, dir)).filter((f) => re.test(f)).map((f) => path.join(KIRO, dir, f));
const read = (f) => fs.readFileSync(f, 'utf8');
const frontMatter = (text) => { const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/); return m ? m[1] : null; };
const TRIGGERS = new Set(['PreToolUse', 'PostToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit', 'PreTaskExec', 'PostTaskExec', 'PreCompact', 'PostCompact', 'PostFileCreate', 'PostFileSave', 'PostFileDelete']);

test('hooks: v1 형식, 알려진 트리거, 유효한 matcher, 존재하는 스크립트', () => {
  const files = list('hooks', /\.json$/);
  assert.ok(files.length >= 11);
  for (const f of files) {
    const cfg = JSON.parse(read(f));
    assert.equal(cfg.version, 'v1', f);
    for (const h of cfg.hooks) {
      assert.ok(h.name && TRIGGERS.has(h.trigger), `${f}: ${h.trigger}`);
      if (h.matcher && !/^(shell|write|read|web|spec)$/.test(h.matcher)) assert.doesNotThrow(() => new RegExp(h.matcher), f);
      if (h.action.type === 'command') {
        const script = h.action.command.match(/^node (\S+\.js)/);
        assert.ok(script, `${f}: node 스크립트를 직접 호출해야 한다`);
        assert.ok(fs.existsSync(path.join(ROOT, script[1])), `${f}: ${script[1]} 없음`);
      } else {
        assert.equal(h.action.type, 'agent');
        assert.ok(h.action.prompt.length > 20, f);
      }
    }
  }
});

test('hooks: 파일 matcher가 의도한 경로에 맞는다', () => {
  const get = (id) => JSON.parse(read(path.join(KIRO, 'hooks', `${id}.json`))).hooks[0].matcher;
  const onSave = new RegExp(get('test-on-save'));
  assert.ok(onSave.test('C:\\repo\\src\\ai\\search.js'));
  assert.ok(onSave.test('scripts/hooks/lib.js'));
  assert.ok(!onSave.test('README.md'));
  assert.ok(new RegExp(get('prompt-change-review')).test('src/ai/prompt.js'));
  assert.ok(!new RegExp(get('prompt-change-review')).test('src/ai/search.js'));
});

test('steering: front matter와 포함 방식, 참조 파일이 있다', () => {
  for (const f of list('steering', /\.md$/)) {
    const text = read(f);
    const fm = frontMatter(text);
    assert.ok(fm, `${f}: front matter 없음`);
    const mode = (fm.match(/inclusion:\s*(\w+)/) || [])[1];
    assert.ok(['always', 'fileMatch', 'manual', 'auto'].includes(mode), f);
    if (mode === 'fileMatch') assert.match(fm, /fileMatchPattern:/, f);
    if (mode === 'auto') { assert.match(fm, /name:/, f); assert.match(fm, /description:/, f); }
    for (const [, ref] of text.matchAll(/#\[\[file:([^\]:]+)/g)) assert.ok(fs.existsSync(path.join(ROOT, ref)), `${f}: ${ref} 없음`);
  }
});

test('agents: front matter에 name·description이 있고 참조 리소스가 있다', () => {
  for (const f of list('agents', /\.md$/)) {
    const fm = frontMatter(read(f));
    assert.ok(fm && /name:/.test(fm) && /description:/.test(fm), f);
    for (const [, ref] of fm.matchAll(/(?:file|skill):\/\/([^\s*]+\.md)/g)) assert.ok(fs.existsSync(path.join(ROOT, ref)), `${f}: ${ref} 없음`);
    for (const [, script] of fm.matchAll(/args: \["([^"]+\.js)"\]/g)) assert.ok(fs.existsSync(path.join(ROOT, script)), `${f}: ${script} 없음`);
  }
});

test('skills: SKILL.md마다 name이 폴더 이름과 같다', () => {
  for (const dir of fs.readdirSync(path.join(KIRO, 'skills'))) {
    const fm = frontMatter(read(path.join(KIRO, 'skills', dir, 'SKILL.md')));
    assert.equal((fm.match(/name:\s*(\S+)/) || [])[1], dir);
    assert.match(fm, /description:/);
  }
});

test('workflows: 이름, steps, 노드 id 중복 없음, 기본 제공 agent만 사용', () => {
  const AGENTS = new Set(['wf-planner', 'wf-coder', 'wf-design', 'wf-design-reviewer', 'wf-review-aggregator', 'wf-pr-submitter', 'wf-pr-responder', 'wf-auto-researcher', 'semantic_reviewer']);
  for (const f of list('workflows', /\.workflow\.ya?ml$/)) {
    const text = read(f);
    assert.match(text, /^name: \S+/m, f);
    assert.match(text, /^steps:/m, f);
    const ids = [...text.matchAll(/^\s*(?:- type: \w+\n\s*)?id: (\S+)/gm)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${f}: 중복 id`);
    for (const [, agent] of text.matchAll(/^\s*agent: (\S+)/gm)) assert.ok(AGENTS.has(agent), `${f}: ${agent}`);
    for (const [, node] of text.matchAll(/type: (\w+)/g)) assert.ok(['step', 'sequence', 'repeat', 'parallel', 'watch'].includes(node), `${f}: ${node}`);
  }
});

test('specs: tasks.md의 요구사항 번호가 requirements.md에 있다', () => {
  for (const spec of fs.readdirSync(path.join(KIRO, 'specs'))) {
    const req = read(path.join(KIRO, 'specs', spec, 'requirements.md'));
    const tasks = read(path.join(KIRO, 'specs', spec, 'tasks.md'));
    const reqNums = new Set([...req.matchAll(/### Requirement (\d+)/g)].map((m) => m[1]));
    for (const [, list] of tasks.matchAll(/_Requirements: ([^_]+)_/g)) {
      for (const ref of list.split(',').map((s) => s.trim().split('.')[0])) assert.ok(reqNums.has(ref), `${spec}: Requirement ${ref} 없음`);
    }
  }
});
