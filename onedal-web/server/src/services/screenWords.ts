import db from "../db";
import { SCREEN_PAGES, WORD_KINDS, type ScreenPage, type WordKind, type ScreenWordsReport } from "@onedal/shared";
import { slog } from "../utils/fileLogger";

/**
 * 📰 **모르는 글자는 버리지 않고 모은다** (reviews/24 2-서버 · 기사님: *"정의되지 않았다고 버리는 것이 문제다 —
 * 앱이 리뉴얼됐을 때 쉽게 알아볼 수 있게"*).
 *
 * 원달앱이 보고 본문 한 칸 `screenWords` 에 그 화면에서 페이지 정의 밖의 글자를
 * 모아 싣는다 — 갈래 셋: `noise` 잡음으로 뺀 글자 · `unknown` 정의에 없는 글자 · `extra` 칸을 채우고 남은 토막. 여기서는 배차망 · 페이지 · 낱말 · 갈래마다 처음 · 마지막 · 횟수를 센다 — 원문을 날마다 쌓지 않고 낱말 표 하나로.
 *
 * 🔴 **자르는 손은 앱 하나다** — 서버는 원문을 다시 자르지 않는다. 두 벌이면 «앱은 버렸는데 서버는 모름»으로 갈라진다.
 * 🔴 **처음 보는 낱말은 알린다** — 배차망 앱이 바뀐 첫 신호다. 다만 한 배차망·페이지 짝의 첫 보고부터 24시간은
 *    모으기만 한다(조용한 첫 하루) — 표가 빈 채로 켜면 지금 있는 낱말이 전부 «새 글자»로 쏟아진다.
 * ⚠️ 아는 낱말의 횟수는 메모리에 모았다가 60초마다 쓴다 — 서버가 꺼지면 그 60초 치를 잃는다(대략이면 된다).
 */


/** 한 낱말 길이 · 한 보고 낱말 수 · 예 한 줄 길이 — 쓰레기 보고가 표를 부풀리지 않게 */
const WORD_MAX_LEN = 40;
const WORDS_PER_REPORT = 200;
const SAMPLE_MAX_LEN = 200;
/** 🤫 조용한 첫 하루 */
export const QUIET_MS = 24 * 3600_000;
const FLUSH_MS = 60_000;

/** 받는 글자는 믿지 않는다 — 모양(`ScreenWordsReport`)은 shared 한 곳이고, 칸마다 여기서 다시 본다 */
type LooseReport = { [K in keyof ScreenWordsReport]?: unknown };
type CleanWord = { kind: WordKind; word: string; sample: string | null };

/** 보고 한 벌을 다듬는다 — 모르는 페이지면 null (지어낸 페이지로 표를 채우지 않는다 · 규칙 ④) · 모르는 갈래의 낱말은 뺀다 */
export function wordsOf(report: LooseReport): { page: ScreenPage; words: CleanWord[] } | null {
    const page = report?.page;
    if (typeof page !== 'string' || !(SCREEN_PAGES as readonly string[]).includes(page)) return null;
    const seen = new Set<string>();
    const words: CleanWord[] = [];
    for (const raw of Array.isArray(report.words) ? report.words as unknown[] : []) {
        const w = raw as { word?: unknown; kind?: unknown; sample?: unknown } | null;
        if (!w || typeof w.word !== 'string' || typeof w.kind !== 'string') continue;
        if (!(WORD_KINDS as readonly string[]).includes(w.kind)) continue;
        const word = w.word.trim();
        const key = `${w.kind}|${word}`;
        if (!word || word.length > WORD_MAX_LEN || seen.has(key)) continue;
        seen.add(key);
        const sample = typeof w.sample === 'string' && w.sample.trim() ? w.sample.slice(0, SAMPLE_MAX_LEN) : null;
        words.push({ kind: w.kind as WordKind, word, sample });
        if (words.length >= WORDS_PER_REPORT) break;
    }
    return { page: page as ScreenPage, words };
}

/** 🤫 이 짝이 아직 조용한 첫 하루인가 — 짝의 가장 이른 첫 봄(ms)이 없으면(처음 온 짝) 조용하다 */
export function isQuietPeriod(earliestFirstSeenMs: number | null, nowMs: number): boolean {
    return earliestFirstSeenMs == null || nowMs < earliestFirstSeenMs + QUIET_MS;
}

const KIND_LABEL: Record<WordKind, string> = { noise: '잡음으로 뺌', unknown: '정의에 없음', extra: '남는 토막' };

const pairKey = (app: string, page: string) => `${app}|${page}`;
const wordKey = (app: string, page: string, kind: string, word: string) => `${app}|${page}|${kind}|${word}`;

/** 알던 낱말 · 짝마다 가장 이른 첫 봄 — 첫 호출 때 표에서 한 번 읽는다 */
let known: Set<string> | null = null;
const earliestOf = new Map<string, number>();
function loadKnown(): Set<string> {
    if (known) return known;
    known = new Set();
    try {
        for (const r of db.prepare(`SELECT target_app, page, word, kind FROM screen_words`).all() as any[])
            known.add(wordKey(r.target_app, r.page, r.kind, r.word));
        for (const r of db.prepare(`SELECT target_app, page, MIN(first_seen) AS first FROM screen_words GROUP BY target_app, page`).all() as any[])
            earliestOf.set(pairKey(r.target_app, r.page), Date.parse(r.first));
    } catch (e) { console.error('📰 [새 글자] 표 읽기 실패 — 빈 표로 시작:', (e as Error).message); }
    return known;
}

/** 아는 낱말의 횟수 · 마지막 본 때 — 60초마다 쓴다 */
const pending = new Map<string, { app: string; page: string; kind: WordKind; word: string; n: number; last: string }>();
/** 조용한 첫 하루를 지나는 중인 짝 — 끝날 때 한 줄 */
const quietPairs = new Map<string, { app: string; page: string; earliest: number }>();

const stmtInsert = db.prepare(`
    INSERT OR IGNORE INTO screen_words (target_app, page, word, kind, first_seen, last_seen, seen_count, sample)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
`);
const stmtUpsert = db.prepare(`
    INSERT INTO screen_words (target_app, page, word, kind, first_seen, last_seen, seen_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (target_app, page, word, kind) DO UPDATE SET last_seen = excluded.last_seen, seen_count = seen_count + excluded.seen_count
`);

export function noteScreenWords(userId: string, targetApp: string, report: LooseReport, io?: any): void {
    try {
        const r = wordsOf(report);
        if (!r || r.words.length === 0) return;
        const set = loadKnown();
        const nowMs = Date.now();
        const now = new Date(nowMs).toISOString();
        const pk = pairKey(targetApp, r.page);
        if (!earliestOf.has(pk)) earliestOf.set(pk, nowMs);
        const earliest = earliestOf.get(pk)!;
        const quiet = isQuietPeriod(earliest, nowMs);
        if (quiet) quietPairs.set(pk, { app: targetApp, page: r.page, earliest });

        for (const { kind, word, sample } of r.words) {
            const wk = wordKey(targetApp, r.page, kind, word);
            if (set.has(wk)) {
                const p = pending.get(wk) ?? { app: targetApp, page: r.page, kind, word, n: 0, last: now };
                p.n++; p.last = now;
                pending.set(wk, p);
                continue;
            }
            set.add(wk);
            stmtInsert.run(targetApp, r.page, word, kind, now, now, sample);
            if (quiet) continue;
            console.warn(`📰 [새 글자] ${targetApp} ${r.page} ‹${word}› 처음 봄 (${KIND_LABEL[kind]})`
                + (sample ? ` — 예: ${sample.slice(0, 60)}` : ''));
            io?.to(userId).emit('screen-word-new', { targetApp, page: r.page, word, kind, firstSeen: now, sample });
        }
    } catch (e) {
        console.error('📰 [새 글자] 기록 실패 (보고는 계속):', (e as Error).message);
    }
}

/** 모아 둔 횟수를 한 트랜잭션으로 쓰고, 조용한 첫 하루가 끝난 짝은 한 줄 남긴다 */
export function flushScreenWords(): void {
    try {
        if (pending.size) {
            const rows = [...pending.values()];
            pending.clear();
            db.transaction(() => {
                for (const p of rows) stmtUpsert.run(p.app, p.page, p.word, p.kind, p.last, p.last, p.n);
            })();
        }
        const nowMs = Date.now();
        for (const [pk, q] of quietPairs) {
            if (isQuietPeriod(q.earliest, nowMs)) continue;
            quietPairs.delete(pk);
            const n = (db.prepare(`SELECT COUNT(*) AS n FROM screen_words WHERE target_app = ? AND page = ?`).get(q.app, q.page) as { n: number }).n;
            slog('화면', `📰 [조용한 첫 하루 끝] ${q.app} ${q.page} — 낱말 ${n}개 모음 · 이제부터 처음 보는 낱말은 알린다`);
        }
    } catch (e) {
        console.error('📰 [새 글자] 모아 쓰기 실패:', (e as Error).message);
    }
}
setInterval(flushScreenWords, FLUSH_MS).unref();
