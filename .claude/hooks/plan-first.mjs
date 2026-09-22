#!/usr/bin/env node
/**
 * 계획 우선 훅 (PreToolUse) — «계획을 먼저 말하기 전에는 도구를 못 쓴다» (기사님 지시).
 *
 * 무엇을 막나: 기사님의 **직전** 말씀 이후로 제가 «계획:» 으로 시작하는 줄을 쓰지 않았으면
 *   모든 도구 호출을 막는다 (종료 코드 2 · 까닭은 stderr 로 저에게 돌아온다).
 * 왜 «직전» 말씀까지 보나: 같은 메시지에 글과 도구 호출이 함께 있으면 Claude Code 가 그 글을
 *   기록 파일에 «생각 요약(thinking)»으로 바꿔 적을 때가 있어, 이번 차례의 글만 보면 놓친다.
 *   글만 있는 메시지는 온전히 적히므로 «계획(글만) → 기사님 답 → 도구» 흐름은 늘 잡힌다.
 *   직전 차례의 계획은 기사님의 마지막 말씀이 **짧을 때**(«가»·«계속»·«고쳐» — SHORT_REPLY 자 이하)만 인정한다.
 *   긴 새 지시에는 이번 차례의 «계획:»이 있어야 한다.
 * 왜 프로그램으로 막나: CLAUDE.md 의 글은 제가 «일의 종류»를 정하는 첫 순간에 읽히지 않는다.
 * 안 막는 것: 하위 에이전트(agent_id 가 있음) — 계획은 주 세션이 쓴다.
 */
import { readFileSync } from 'node:fs';

const PLAN_LINE = /^\s*(?:\*\*|__)?\s*계획\s*[:：]/m;

function readStdin() {
    try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function block(reason) {
    process.stderr.write(reason + '\n');
    process.exit(2);
}

const input = (() => { try { return JSON.parse(readStdin() || '{}'); } catch { return {}; } })();

if (input.agent_id) process.exit(0);

let lines = [];
try { lines = readFileSync(input.transcript_path, 'utf8').split('\n').filter(Boolean); }
catch { block('🔴 계획 우선 훅: 대화 기록을 읽지 못했다 — 먼저 «계획:» 으로 시작하는 줄에 무엇을·어떻게·왜를 쓴다.'); }

/** 실제 사용자 메시지 = user 타입이고 tool_result 가 없는 것 (도구 결과도 user 타입으로 실린다) */
function isRealUserMessage(rec) {
    if (rec.type !== 'user' || rec.isMeta || rec.isSidechain) return false;
    const c = rec.message?.content;
    if (typeof c === 'string') return true;
    if (!Array.isArray(c)) return false;
    return !c.some(b => b?.type === 'tool_result');
}

/** 화면에 보이는 글만 센다 — thinking 은 기사님이 못 보므로 계획이 아니다 */
function assistantTexts(rec) {
    if (rec.type !== 'assistant' || rec.isSidechain) return [];
    const c = rec.message?.content;
    if (typeof c === 'string') return [c];
    if (!Array.isArray(c)) return [];
    return c.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text);
}

const recs = [];
const userIdx = [];
for (const line of lines) {
    let rec; try { rec = JSON.parse(line); } catch { continue; }
    recs.push(rec);
    if (isRealUserMessage(rec)) userIdx.push(recs.length - 1);
}

/** 사용자 메시지의 글 — 도구 결과·IDE 알림 태그는 뺀다 */
function userText(rec) {
    const c = rec.message?.content;
    const raw = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b?.type === 'text').map(b => b.text).join('\n') : '';
    return raw.replace(/<[a-z_]+>[\s\S]*?<\/[a-z_]+>/g, '').trim();
}
const SHORT_REPLY = 20;
const last = userIdx[userIdx.length - 1];
const shortReply = last != null && userText(recs[last]).length <= SHORT_REPLY;
// 짧은 답이면 직전 차례(뒤에서 둘째 사용자 메시지 이후)까지, 아니면 이번 차례만 — 사용자 메시지가 없으면 처음부터
const from = last == null ? 0 : (shortReply && userIdx.length >= 2 ? userIdx[userIdx.length - 2] : last) + 1;
const planned = recs.slice(from).some(rec => assistantTexts(rec).some(t => PLAN_LINE.test(t)));

if (!planned) {
    block(`🔴 계획 우선 훅: ${shortReply ? '이번 차례에도 직전 차례에도' : '이번 차례에'} «계획:» 줄이 없다 — 도구를 부르기 전에 «계획:» 으로 시작하는 줄에 무엇을·어떻게·왜, 그리고 «무엇이 참이면 끝인가»를 먼저 쓴다. (물으신 것이면 답부터 하고 도구는 안 쓴다)`);
}
process.exit(0);
