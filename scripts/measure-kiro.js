'use strict';
// Kiro CLI 실측: 고정된 예시 주제로 전체 생성 프롬프트를 N번 실행하고 응답 시간, JSON 파싱 성공률, 목표 개수 충족률을 출력한다.
// 출력은 숫자만 남긴다. 생성된 문장이나 검색 본문은 화면·파일에 남기지 않는다.
//
// 사용법:
//   node scripts/measure-kiro.js                 # Kiro CLI, 주제당 2회, 위키백과 검색 포함
//   node scripts/measure-kiro.js --runs 5        # 주제당 5회
//   node scripts/measure-kiro.js --no-search     # 검색 없이(출처 없음) 생성만 측정
//   node scripts/measure-kiro.js --offline       # kiro-cli 없이 스크립트 동작만 확인(오프라인 간이 모드)
const { spawnSync } = require('node:child_process');
const { createKiroProvider } = require('../src/ai/providers/kiro');
const { createOfflineProvider } = require('../src/ai/providers/offline');
const { searchTopic } = require('../src/ai/search');
const prompt = require('../src/ai/prompt');
const { extractJson, normalizeResult } = require('../src/ai/schema');

const SAMPLES = [
  { text: '양자 컴퓨터', tone: 'casual' },
  { text: '요즘 회사에서 생성형 AI를 업무에 많이 쓰더라고요', tone: 'work' },
  { text: '쿠버네티스 Kubernetes 클러스터 운영', tone: 'work' },
];

function args(argv) {
  const has = (f) => argv.includes(f);
  const i = argv.indexOf('--runs');
  const runs = i >= 0 ? Math.max(1, Math.min(20, Number(argv[i + 1]) || 1)) : 2;
  return { runs, search: !has('--no-search'), offline: has('--offline') };
}

/** kiro-cli 실행 가능 여부와 인증 방식. 로그인 세션(kiro-cli login)이 KIRO_API_KEY보다 먼저 쓰인다. */
function kiroReady(spawn = spawnSync, env = process.env) {
  const cmd = env.KIRO_CLI_PATH || 'kiro-cli';
  const opts = { shell: false, windowsHide: true, encoding: 'utf8', timeout: 15000 };
  const v = spawn(cmd, ['--version'], opts);
  if (v.error) return { ok: false, why: `${cmd}를 실행할 수 없어요(${v.error.code || v.error.message}). 설치 후 PATH에 추가하거나 KIRO_CLI_PATH를 설정하세요.` };
  const version = String(v.stdout || '').trim().split(/\r?\n/)[0];
  const who = spawn(cmd, ['whoami'], opts);
  if (!who.error && who.status === 0) return { ok: true, version, auth: '로그인 세션' };
  if (env.KIRO_API_KEY) return { ok: true, version, auth: 'KIRO_API_KEY' };
  return { ok: false, why: '인증 정보가 없어요. kiro-cli login으로 로그인하거나 KIRO_API_KEY를 설정하세요.' };
}

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '-');
function quantile(list, q) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

async function main() {
  const opt = args(process.argv.slice(2));
  let provider;
  if (opt.offline) {
    provider = createOfflineProvider();
  } else {
    const ready = kiroReady();
    if (!ready.ok) { console.log(`측정을 건너뜁니다: ${ready.why}`); process.exit(2); }
    console.log(`kiro-cli ${ready.version} (인증: ${ready.auth})`);
    provider = createKiroProvider();
  }
  console.log(`공급자: ${provider.label}, 주제 ${SAMPLES.length}개 x ${opt.runs}회, 검색 ${opt.search ? '포함' : '제외'}`);

  const rows = [];
  for (const [si, sample] of SAMPLES.entries()) {
    const found = opt.search ? await searchTopic(sample.text) : { status: 'skipped', sources: [] };
    const ctx = { ...sample, note: '', direction: '', sources: found.sources, topicHint: '' };
    const promptText = prompt.buildFullPrompt(ctx);
    for (let run = 1; run <= opt.runs; run++) {
      const row = { sample: si + 1, run, search: found.status, sources: found.sources.length, promptChars: promptText.length };
      const t0 = Date.now();
      try {
        const raw = await provider.generate({ prompt: promptText, ctx, kind: 'full' });
        row.ms = Date.now() - t0;
        const json = extractJson(raw);
        row.json = true;
        const r = normalizeResult(json, found.sources);
        row.statements = r.statements.length;
        row.questions = r.questions.length;
        row.switches = r.topicSwitches.length;
        row.sourced = r.statements.filter((s) => s.basis === 'sourced').length;
        row.targetsMet = r.shortfalls.length === 0;
      } catch (e) {
        row.ms = row.ms || Date.now() - t0;
        row.json = false;
        row.error = String((e && e.message) || e).slice(0, 80);
      }
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }

  const ok = rows.filter((r) => r.json);
  const times = rows.map((r) => r.ms);
  console.log('\n요약');
  console.log(`- 실행 ${rows.length}회, JSON 파싱 성공 ${ok.length}회 (${pct(ok.length, rows.length)})`);
  console.log(`- 목표 개수 충족 ${ok.filter((r) => r.targetsMet).length}회 (${pct(ok.filter((r) => r.targetsMet).length, rows.length)})`);
  console.log(`- 응답 시간 중앙값 ${quantile(times, 0.5)}ms, 최대 ${Math.max(...times)}ms (타임아웃 ${provider.timeoutMs || '-'}ms)`);
  if (ok.length) {
    const avg = (k) => (ok.reduce((a, r) => a + r[k], 0) / ok.length).toFixed(1);
    console.log(`- 평균 개수: 문장 ${avg('statements')}(출처 연결 ${avg('sourced')}), 질문 ${avg('questions')}, 화제 전환 ${avg('switches')}`);
  }
  process.exit(ok.length === rows.length ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
}

module.exports = { kiroReady, quantile };
