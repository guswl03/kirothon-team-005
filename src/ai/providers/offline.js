'use strict';
// 외부 AI 없이 동작하는 간이 모드. 검색된 자료의 문장을 인용하는 방식으로만 만들고, 사실을 지어내지 않는다.
// 품질은 LLM 대비 제한적이므로 UI에 '간이 모드'로 표시한다.

function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ')
    .split(/(?<=[.!?。])\s+/).map((s) => s.trim()).filter((s) => s.length >= 12 && s.length <= 160);
}

const T = {
  casual: {
    cite: (s) => `자료를 보니 "${s}"라고 하더라고요.`,
    topicMention: (t) => `요즘 ${t} 얘기가 은근히 자주 보이더라고요.`,
    curious: (t) => `${t}, 저도 궁금해서 좀 찾아보고 있었어요.`,
    ask: (t) => `${t}에 대해 어떻게 생각하세요?`,
    hedge: '정확한 건 더 찾아봐야 알 것 같아요.',
    switches: [
      { topic: '근황', line: '그나저나 요즘 어떻게 지내세요?' },
      { topic: '주말 계획', line: '아, 그러고 보니 이번 주말에는 뭐 하세요?' },
      { topic: '최근 본 콘텐츠', line: '혹시 요즘 재미있게 본 거 있어요?' },
    ],
  },
  work: {
    cite: (s) => `확인해 보니 "${s}"라는 설명이 있었습니다.`,
    topicMention: (t) => `${t} 관련해서는 저도 자료를 참고하고 있습니다.`,
    curious: (t) => `${t}에 대해서는 조금 더 확인해 보고 말씀드리겠습니다.`,
    ask: (t) => `${t} 건에 대해 팀에서는 어떻게 보고 계신가요?`,
    hedge: '정확한 내용은 추가로 확인한 뒤 공유드리겠습니다.',
    switches: [
      { topic: '다음 일정', line: '관련해서 다음 일정은 어떻게 잡으면 좋을까요?' },
      { topic: '우선순위', line: '이 부분은 우선순위를 먼저 정리해 보면 어떨까요?' },
      { topic: '진행 상황', line: '그럼 현재 진행 상황도 간단히 공유해 주시겠어요?' },
    ],
  },
};

function createOfflineProvider() {
  return {
    id: 'offline',
    label: '오프라인 간이 모드',
    external: false,
    // 동일한 generate 인터페이스를 쓰기 위해 구조화된 JSON 문자열을 돌려준다.
    async generate({ ctx, kind, avoid = [], question }) {
      const t = T[ctx.tone] || T.casual;
      const topic = (ctx.topicHint || ctx.text).slice(0, 40);
      const src = ctx.sources || [];
      const cites = [];
      for (const s of src) for (const sent of sentences(s.extract)) cites.push({ sent, id: s.id });
      const hasSrc = cites.length > 0;
      const pick = (i) => cites[i % Math.max(cites.length, 1)];

      if (kind === 'followup') {
        if (!hasSrc) return JSON.stringify({ answers: [], insufficient: true, note: '검색된 자료가 없어 근거 있는 답변을 만들 수 없어요.' });
        const answers = [0, 1, 2].slice(0, Math.min(3, cites.length)).map((i) => ({ text: t.cite(pick(i).sent), sourceIds: [pick(i).id] }));
        answers.push({ text: t.hedge, sourceIds: [] });
        return JSON.stringify({ answers, insufficient: false, note: '간이 모드: 자료 문장을 인용한 답변이에요.' });
      }

      const statements = [];
      cites.slice(0, 3).forEach((c) => statements.push({ text: t.cite(c.sent), basis: 'sourced', sourceIds: [c.id] }));
      statements.push({ text: t.topicMention(topic), basis: 'general', sourceIds: [] });
      statements.push({ text: t.curious(topic), basis: 'general', sourceIds: [] });
      statements.push({ text: t.ask(topic), basis: 'general', sourceIds: [] });
      const questions = [
        { question: `${topic}이(가) 정확히 뭐예요?`, answers: hasSrc
          ? [{ text: t.cite(pick(0).sent), sourceIds: [pick(0).id] }, { text: t.hedge, sourceIds: [] }]
          : [{ text: t.hedge, sourceIds: [] }, { text: '제가 아는 범위는 제한적이라 한번 같이 찾아봐도 좋겠어요.', sourceIds: [] }] },
        { question: '그건 언제부터 그랬어요?', answers: [{ text: t.hedge, sourceIds: [] }, { text: '시점은 자료마다 달라서 확인이 필요해 보여요.', sourceIds: [] }] },
        { question: '왜 그렇게 된 거예요?', answers: hasSrc && cites.length > 1
          ? [{ text: t.cite(pick(1).sent), sourceIds: [pick(1).id] }, { text: t.hedge, sourceIds: [] }]
          : [{ text: t.hedge, sourceIds: [] }, { text: '이유는 여러 가지가 있다고 하는데 확실하진 않아요.', sourceIds: [] }] },
        { question: '관심 있으세요?', answers: [{ text: t.curious(topic), sourceIds: [] }, { text: '아직 잘 몰라서 배우는 중이에요.', sourceIds: [] }] },
        { question: '어떻게 생각하세요?', answers: [{ text: '장단점이 다 있어 보여서 좀 더 들어보고 싶어요.', sourceIds: [] }, { text: '저는 아직 판단하기엔 정보가 부족한 것 같아요.', sourceIds: [] }] },
      ];
      const switches = t.switches.map((s) => ({ ...s, sourceIds: [] }));

      if (kind === 'statement' || kind === 'question' || kind === 'switch') {
        const pool = kind === 'statement' ? statements : kind === 'question' ? questions : switches;
        const key = kind === 'statement' ? 'statements' : kind === 'question' ? 'questions' : 'topicSwitches';
        const seen = (it) => avoid.includes(it.text || it.question || it.line);
        const fresh = pool.filter((it) => !seen(it));
        return JSON.stringify({ [key]: fresh.length ? [fresh[0]] : [] });
      }
      return JSON.stringify({
        topic,
        keyFacts: cites.slice(0, 3).map((c) => ({ text: c.sent, sourceIds: [c.id] })),
        statements, questions, topicSwitches: switches,
      });
    },
  };
}

module.exports = { createOfflineProvider, sentences };