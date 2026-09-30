import { readFileSync } from 'fs';
import { join } from 'path';
import { isQuietPeriod, wordsOf, QUIET_MS } from '../../src/services/screenWords';

/**
 * 📰 **모르는 글자는 버리지 않고 모은다** (reviews/24 2-서버 · 기사님 «정의되지 않았다고 버리지 말고 모아라»).
 *
 * 앱이 보고 본문 한 칸 `screenWords`(페이지 · 갈래 셋 noise/unknown/extra · 예 한 줄)를 싣는다.
 * 서버는 배차망 · 페이지 · 낱말 · 갈래마다 처음 · 마지막 · 횟수를 센다 — 자르는 손은 앱 하나다.
 * 처음 보는 낱말은 `📰 [새 글자]` 경고와 관제웹 한 줄 — 배차망 앱이 바뀐 첫 신호다.
 * 🔴 조용한 첫 하루: 한 배차망·페이지 짝의 첫 보고부터 24시간은 모으기만 한다(첫날 홍수 막기).
 */
const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('📰 낱말 표', () => {
    it('screen_words 표가 선다 — 배차망·페이지·낱말·갈래가 열쇠', () => {
        const db = read('db.ts');
        expect(db).toContain('CREATE TABLE IF NOT EXISTS screen_words');
        expect(db).toMatch(/PRIMARY KEY \(target_app, page, word, kind\)/);
    });

    it('목록 보고가 screenWords 를 넘긴다 — 없는 보고(옛 앱)는 그냥 지나간다', () => {
        expect(read('routes/scrap.ts')).toContain('if (body.screenWords) noteScreenWords(userId, targetApp, body.screenWords, req.app.get("io"));');
    });

    it('아는 낱말은 60초마다 한 트랜잭션으로 모아 쓴다', () => {
        const s = read('services/screenWords.ts');
        expect(s).toMatch(/setInterval\(flushScreenWords, FLUSH_MS\)\.unref\(\)/);
        expect(s).toContain('ON CONFLICT (target_app, page, word, kind) DO UPDATE SET last_seen = excluded.last_seen, seen_count = seen_count + excluded.seen_count');
    });

    it('처음 본 낱말은 경고 한 줄과 관제웹 이벤트', () => {
        const s = read('services/screenWords.ts');
        expect(s).toContain('📰 [새 글자]');
        expect(s).toContain("emit('screen-word-new'");
        expect(s).toContain('📰 [조용한 첫 하루 끝]');
    });
});

describe('📰 보고 한 벌 다듬기 — wordsOf', () => {
    it('갈래 셋(잡음 · 정의에 없음 · 남는 토막)을 함께 낸다 · 같은 낱말은 한 번', () => {
        const r = wordsOf({ page: 'list', noise: ['신규'], unknown: ['당상', '당상', '내착'], extra: ['(수)'], sample: '당상 12:30 광주 → 이천' });
        expect(r?.page).toBe('list');
        expect(r?.words).toEqual([{ kind: 'noise', word: '신규' }, { kind: 'unknown', word: '당상' }, { kind: 'unknown', word: '내착' }, { kind: 'extra', word: '(수)' }]);
        expect(r?.sample).toBe('당상 12:30 광주 → 이천');
    });

    it('🔴 모르는 페이지는 버린다 — 표를 지어낸 페이지로 채우지 않는다', () => {
        expect(wordsOf({ page: 'home', unknown: ['가'] })).toBeNull();
        expect(wordsOf({ unknown: ['가'] })).toBeNull();
    });

    it('글자가 아니거나 비었거나 40자를 넘는 낱말은 뺀다 · 한 보고 200개까지 · 예는 200자까지', () => {
        const long = 'ㄱ'.repeat(41);
        const many = Array.from({ length: 300 }, (_, i) => `낱${i}`);
        const r = wordsOf({ page: 'detail', unknown: [1, '', '  ', long, ...many], sample: 'ㄴ'.repeat(500) });
        expect(r?.words.length).toBe(200);
        expect(r?.words.every(w => w.word.length <= 40 && w.word.trim() === w.word)).toBe(true);
        expect(r?.sample?.length).toBe(200);
    });
});

describe('📰 조용한 첫 하루 — isQuietPeriod', () => {
    const t0 = Date.parse('2026-09-30T09:00:00+09:00');
    it('처음 온 짝(표에 없음)은 조용하다', () => expect(isQuietPeriod(null, t0)).toBe(true));
    it('첫 보고부터 24시간 안은 조용하다', () => expect(isQuietPeriod(t0, t0 + QUIET_MS - 1)).toBe(true));
    it('24시간이 지나면 알린다', () => expect(isQuietPeriod(t0, t0 + QUIET_MS)).toBe(false));
});
