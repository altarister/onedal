// @ts-nocheck
import db from '../../src/db';
import { judge, CRITERIA, DEFAULT_JUDGMENT, toSnapshot, JUDGMENT_FIELDS } from '@onedal/shared';
import { firstLoadFacts } from '../../src/core/engine/judgeFacts';

/**
 * 🔔 **벨은 색이 아니라 점수로 — 점수가 벨 점수(기본 50) 이상이면 울린다** (기사님 «가» · onedal-1f).
 * 기사님: «우리 시스템이 녹색이어도 별로인 걸로 바뀌었는데, 소리는 녹색·파랑일 때 울린다» · «색 말고 점수가 50점 이상이면».
 * 서버가 판정 때 정해 판정 결과(bell)에 싣고, 관제웹은 그 한 칸만 읽는다. 🟡 라도 점수가 넘으면 울린다 · 점수 없음은 안 울린다.
 */
const cfg = DEFAULT_JUDGMENT;
const first = (fare: number, minutes: number) => firstLoadFacts({ fare, totalMinutes: minutes, tags: [], excludedHits: [], pickupBackward: null, trapped: null });

describe('🔔 벨 점수', () => {
    it('🔴 기본 벨 점수는 50 — 판정 기준 표 «알림» 묶음의 한 칸', () => {
        expect(cfg.bell.scoreMin).toBe(50);
        const f = JUDGMENT_FIELDS.find(x => x.col === 'bell_score_min');
        expect(f).toMatchObject({ path: ['bell', 'scoreMin'], group: '알림', int: true });
    });
    it('🔴 점수가 벨 점수 이상이면 bell · 아니면 아님 — 색과 따로', () => {
        const snaps = [first(50_000, 60), first(8_000, 90)].map(f => toSnapshot(judge(CRITERIA, f, cfg)));
        for (const s of snaps) expect(s.bell).toBe(s.score != null && s.score >= 50);
        expect(snaps.some(s => s.bell)).toBe(true);
        expect(snaps.some(s => !s.bell)).toBe(true);
    });
    it('🔴 문턱은 설정값을 따른다', () => {
        const s = toSnapshot(judge(CRITERIA, first(50_000, 60), cfg));
        const high = toSnapshot(judge(CRITERIA, first(50_000, 60), { ...cfg, bell: { scoreMin: (s.score ?? 0) + 1 } }));
        expect(high.bell).toBe(false);
    });
    it('🔴 옛 DB 에도 칸이 붙는다 — DEFAULT 50', () => {
        const col = (db.prepare(`PRAGMA table_info(user_judgment)`).all() as any[]).find(c => c.name === 'bell_score_min');
        expect(col).toBeTruthy();
        expect(String(col.dflt_value)).toBe('50');
    });
});
