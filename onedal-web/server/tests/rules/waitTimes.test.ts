import { readFileSync } from 'fs';
import { join } from 'path';
import {
    APP_FILTER_KEYS, SAFE_CANCEL_SEC_DEFAULT, PICKER_ALARM_DETAIL_SEC_DEFAULT, SERVER_CLEANUP_EXTRA_SEC,
    DEFAULT_WAIT_TIMES, safeCancelSecOf, waitSecOrNull,
} from '@onedal/shared';

/**
 * ⏱️ **배차망별 대기 시간 — 서버 DB 가 원천이고 원달앱은 받아 쓴다** (기사님 확정)
 *
 * 기사님: *"서버가 30초란걸 알고 있고 그걸 받아서 스켄앱이 그렇게 작동해야 하는거야.
 * 시뮬레이터는 진짜 픽커 처럼 작동해야 하는거고."*
 *
 * ── 왜 필요했나 ──
 * 30초가 **서로 모른 채** 여섯 자리에 있었다 — 원달앱 폰 설정(`safeCancelTimeout`) ·
 * 원달앱 알람 상세 복귀 · 서버 첫 보고 타이머 · 서버 둘째 보고 경고·해제 · 관제웹 판정석·홀드 막대 ·
 * 시뮬레이터. 한 곳을 바꿔도 나머지는 30초로 돈다.
 *
 * 🔴 **이 검사는 규칙 ⑤-4 의 다섯이 끝까지 이어졌는지를 본다**.
 *    값이 태어나도 «저장할 자리 · 고칠 화면 · 읽는 곳» 중 하나가 끊기면 조용히 코드 숫자로 남는다.
 */

const SERVER = join(__dirname, '../../src');
const CLIENT = join(__dirname, '../../../client-app/src');
const SHARED = join(__dirname, '../../../shared/src');
const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const read = (abs: string) => readFileSync(abs, 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const KEYS = ['safeCancelSecInsung', 'safeCancelSecHwamul24', 'pickerAlarmDetailSec'] as const;

describe('배차망별 대기 시간 — ② 값 (shared 한 곳)', () => {

    it('기본은 인성 30초 · 화물24시 30초 · 픽커 알람 상세 30초 · 서버 정리는 +5초', () => {
        expect(SAFE_CANCEL_SEC_DEFAULT).toBe(30);
        expect(PICKER_ALARM_DETAIL_SEC_DEFAULT).toBe(30);
        expect(SERVER_CLEANUP_EXTRA_SEC).toBe(5);
        expect(DEFAULT_WAIT_TIMES).toEqual({ safeCancelSecInsung: 30, safeCancelSecHwamul24: 30, pickerAlarmDetailSec: 30 });
    });

    /**
     * 🔴 **1초 미만은 값이 아니라 고장이다** (리뷰).
     * 관제웹 칸을 비우고 저장하면 `parseInt('') || 0` 으로 **0초**가 저장됐다 — 인성 안전취소 0초면 원달앱이 잡자마자 스스로 취소한다.
     * 상한은 걸지 않는다(기사님 확정) · 하한만 막는다. 못 받은 값은 `null` — 설정 경로가 옛 값을 그대로 둔다(COALESCE).
     */
    it('🔴 대기 시간 입력 — 1 이상 정수만 받는다 · 0·음수·빈 값·숫자 아님은 null (설정 경로가 옛 값을 둔다)', () => {
        expect(waitSecOrNull(30)).toBe(30);
        expect(waitSecOrNull(600)).toBe(600);          // 상한 없음 (기사님 확정)
        expect(waitSecOrNull('45')).toBe(45);
        expect(waitSecOrNull(0)).toBeNull();
        expect(waitSecOrNull(-5)).toBeNull();
        expect(waitSecOrNull('')).toBeNull();
        expect(waitSecOrNull(undefined)).toBeNull();
        expect(waitSecOrNull(null)).toBeNull();
        expect(waitSecOrNull('abc')).toBeNull();
        expect(waitSecOrNull(12.7)).toBe(12);
        const st = codeOnly(read(join(SERVER, 'routes/settings.ts')));
        for (const k of KEYS) expect(st).toMatch(new RegExp(`${k}: waitSecOrNull\\(payload\\.${k}\\)`));
    });

    it('🔴 뜻이 다른 둘을 한 값으로 쓰지 않는다 — 픽커는 안전취소가 없다 (수락하기가 곧 계약)', () => {
        const w = { safeCancelSecInsung: 45, safeCancelSecHwamul24: 20, pickerAlarmDetailSec: 90 };
        expect(safeCancelSecOf(w, 'insung')).toBe(45);
        expect(safeCancelSecOf(w, 'hwamul24')).toBe(20);
        expect(safeCancelSecOf(w, 'kakaopicker')).toBeNull();
        // 모르는 배차망은 기본 배차망(인성)으로 — 서버가 targetApp 을 기본값으로 받는 규칙과 같다
        expect(safeCancelSecOf(w, undefined)).toBe(45);
    });
});

describe('배차망별 대기 시간 — ① 스키마 · ③ 시점', () => {

    it('① DB 칸 셋이 기존 DB 에도 붙는다 (ensureColumns) — 기본값은 DB DEFAULT', () => {
        const db = codeOnly(read(join(SERVER, 'db.ts')));
        const ensured = db.slice(db.indexOf("ensureColumns('user_settings'"));
        const block = ensured.slice(0, ensured.indexOf('});'));
        expect(block).toMatch(/safe_cancel_sec_insung:\s*'INTEGER DEFAULT 30'/);
        expect(block).toMatch(/safe_cancel_sec_hwamul24:\s*'INTEGER DEFAULT 30'/);
        expect(block).toMatch(/picker_alarm_detail_sec:\s*'INTEGER DEFAULT 30'/);
    });

    it('③ 설정 경로가 내주고 받아 적는다 — 설정 행이 없던 계정(INSERT 갈래)에서도', () => {
        const st = codeOnly(read(join(SERVER, 'routes/settings.ts')));
        for (const k of KEYS) {
            expect(st.split(`${k}:`).length - 1).toBeGreaterThanOrEqual(3);   // GET · UPDATE · INSERT 뒤 UPDATE
            expect(st).toMatch(new RegExp(`COALESCE\\(@${k}`));
        }
    });

    it('③ 원달앱에 보내는 응답에 셋이 실린다 — 표에도 있다', () => {
        for (const k of KEYS) expect((APP_FILTER_KEYS as readonly string[]).includes(k)).toBe(true);
        const scrap = codeOnly(read(join(SERVER, 'routes/scrap.ts')));
        expect(scrap).toMatch(/readWaitTimes\(/);
    });
});

describe('배차망별 대기 시간 — ⑤ 읽는 곳에 30초가 박혀 있지 않다', () => {

    it('🔴 서버 첫 보고 타이머가 그 콜 배차망의 값을 쓴다', () => {
        const orders = codeOnly(read(join(SERVER, 'routes/orders.ts')));
        expect(orders).toMatch(/safeCancelSecOf\(/);
        expect(orders).not.toMatch(/\b30000\b/);
    });

    it('🔴 서버 둘째 보고 경고·해제가 그 값을 쓴다 — 옛 상수가 없다', () => {
        const detail = codeOnly(read(join(SERVER, 'routes/detail.ts')));
        expect(detail).toMatch(/safeCancelSecOf\(/);
        expect(detail).not.toMatch(/WAITING_(WARNING|TIMEOUT)_MS/);
        expect(codeOnly(read(join(SERVER, 'config/dispatchConfig.ts')))).not.toMatch(/WAITING_(WARNING|TIMEOUT)_MS/);
    });

    it('🔴 관제웹 판정석 장막 · 홀드 막대가 30초를 박지 않는다', () => {
        const seat = codeOnly(read(join(CLIENT, 'components/dashboard/JudgmentSeat.tsx')));
        expect(seat).not.toMatch(/seat-drain 30s/);
        expect(seat).toMatch(/safeCancelSecOf\(/);
        const card = codeOnly(read(join(CLIENT, 'components/dashboard/PinnedRouteCard.tsx')));
        expect(card).not.toMatch(/\/30초/);
        expect(card).not.toMatch(/telemetryCount \/ 30\b/);
        expect(card).toMatch(/safeCancelSecOf\(/);
    });

    it('④ 관제웹 일반 설정에서 고친다 — 칸 옆에 «인성 취소 가능 시간 1분» (기사님 확정: 상한은 걸지 않는다)', () => {
        const tab = read(join(CLIENT, 'components/dashboard/settings/GeneralSettingsTab.tsx'));
        for (const k of KEYS) expect(tab).toMatch(new RegExp(k));
        expect(tab).toMatch(/인성 취소 가능 시간 1분/);
        const store = codeOnly(read(join(CLIENT, 'stores/settingsStore.ts')));
        expect(store).toMatch(/safeCancelSecInsung/);
        expect(store).toMatch(/DEFAULT_WAIT_TIMES/);
    });

    it('🔴 원달앱이 서버 값을 받아 쓴다 — 폰 안 저장소의 30·40·50초와 30초 숫자가 없다', () => {
        const models = codeOnly(read(join(APP, 'models/SharedModels.kt')));
        const fc = models.slice(models.indexOf('data class FilterConfig('));
        const block = fc.slice(0, fc.indexOf('\n)'));
        for (const k of KEYS) expect(block).toMatch(new RegExp(`val\\s+${k}\\s*:\\s*Int`));

        const hijack = codeOnly(read(join(APP, 'HijackService.kt')));
        expect(hijack).not.toMatch(/getLong\("safeCancelTimeout"/);
        expect(hijack).not.toMatch(/postDelayed\(r,\s*30_000L\)/);
        expect(hijack).toMatch(/WaitTimes\.safeCancelMs\(/);
        expect(hijack).toMatch(/WaitTimes\.pickerAlarmDetailMs\(/);

        expect(codeOnly(read(join(APP, 'ui/SettingsScreen.kt')))).not.toMatch(/30000L to "30초"/);
        expect(codeOnly(read(join(APP, 'ui/MainViewModel.kt')))).not.toMatch(/saveSafeCancelTimeout/);
    });

    it('기본값은 shared 한 곳이다 — 서버 읽기 도구가 그것을 쓴다', () => {
        expect(codeOnly(read(join(SHARED, 'index.ts')))).toMatch(/SAFE_CANCEL_SEC_DEFAULT = 30/);
        expect(codeOnly(read(join(SERVER, 'core/waitTimes.ts')))).toMatch(/DEFAULT_WAIT_TIMES/);
    });
});
