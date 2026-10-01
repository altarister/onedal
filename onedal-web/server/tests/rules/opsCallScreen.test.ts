import { readFileSync } from 'fs';
import { join } from 'path';
import { baseDayOf, promisedAtOf } from '../../../ops/src/api/callNote';

/**
 * 📞 **통화 도우미 화면 — 약속 시각의 기준 날은 그 콜의 상차 예정 시각의 한국 달력 날** (onedal-1f · reviews/29 5단계).
 *    오늘로 박으면 내일 상차 콜의 약속이 하루 어긋나고, 영업일 키면 새벽 02:00 상차 콜이 전날로 붙는다.
 *    화면은 서버 문(`/ops/calls` · `/calls/:id/note`)만 부르고, 관제웹 통화 단계는 «✍️ 누가 적음» 한 줄을 그린다.
 */
const WEB = join(__dirname, '../../..');
const read = (f: string) => readFileSync(join(WEB, f), 'utf8');
const NOW = Date.parse('2026-10-01T10:00:00+09:00');

describe('📞 통화 도우미 화면', () => {
    it('🔴 내일 상차 콜에 14:30 → 내일 14:30 (오늘이 아니다)', () => {
        expect(promisedAtOf('2026-10-02T09:00:00+09:00', '14:30', NOW)).toBe('2026-10-02T14:30:00+09:00');
    });
    it('🔴 새벽 02:00 상차 콜 → 그 날 날짜(영업일로 전날에 붙지 않는다)', () => {
        expect(baseDayOf('2026-10-02T02:00:00+09:00', NOW)).toBe('2026-10-02');
        expect(promisedAtOf('2026-10-02 02:00:00', '02:30', NOW)).toBe('2026-10-02T02:30:00+09:00');   // 지역 글자도 같은 날
    });
    it('예정 시각이 없으면 오늘(한국 달력 날) · 시각이 비면 null', () => {
        expect(baseDayOf(null, NOW)).toBe('2026-10-01');
        expect(promisedAtOf(null, '', NOW)).toBeNull();
    });
    it('🔴 화면은 서버 문만 — 짐 단위는 shared CARGO_UNITS · «상대 취소»는 체크 칸(손댔을 때만 실음) · CANCEL 버튼 없음 · 짐은 상차에서만', () => {
        const calls = read('ops/src/pages/Calls.tsx');
        expect(calls).toContain("api.calls(");
        expect(calls).toContain("api.writeCallNote(c.id, note)");
        expect(calls).toContain('CARGO_UNITS.map(');
        expect(calls).not.toMatch(/cargoSize/);
        expect(calls).toContain('...(cancelTouched != null ? { counterpartCancelled: cancelTouched } : {})');   // 안 건드리면 안 싣는다 — 서버가 그대로 둔다
        expect(calls).toContain('placeholder="통화에서 들은 것"');
        /* 적은 뒤에 온 취소 소식 — 아래 목록 줄의 글 버튼은 그 사실 칸만 싣는다(짐 · 약속 · 메모는 비워 보내 서버가 그대로 둔다) · 지우기는 한 번 묻는다 */
        expect(calls).toContain("unit: null, quantity: null, promisedArrivalAt: null, memo: '', counterpartCancelled: !on");
        /* 지우기는 번복용이 아니다(상대가 취소했으면 기사도 취소하고 끝) — «잘못 누름 지우기»만 · 한 번 묻는다 */
        expect(calls).toContain("if (on && !window.confirm('잘못 누른 표시를 지웁니다 — 상대가 정말 취소했다면 지우지 마세요')) return;");
        expect(calls).toContain("{on ? '잘못 누름 지우기' : '상대가 취소했다고 함 적기'}");
        expect(calls).not.toContain('취소 표시 지우기');
        expect(calls).toContain('<CancelToggle c={c} reload={reload} />');
        expect(calls.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/<Button[^>]*>[^<]*(CANCEL|취소)[^<]*<\/Button>|decide|emit\(/);   // 결재는 기사 몫
        expect(calls).toContain('unit: pickup ? unit : null');
        const ops = read('ops/src/api/ops.ts');
        expect(ops).toMatch(/post<OpsCall>\(`\/calls\/\$\{id\}\/note`, note\)/);
    });
    it('🔴 관제웹 통화 단계는 적은 사람(writtenByName)이 있으면 한 줄 — 짐 · 약속 · 메모는 새 줄 없이 칸에 들어간다', () => {
        const sheet = read('client-app/src/components/dashboard/StepSheetMock.tsx');
        expect(sheet).toContain('writtenByName={view.writtenByName}');
        expect(sheet).toMatch(/\{writtenByName && \(/);
        expect((sheet.match(/writtenByName/g) ?? []).length).toBeLessThanOrEqual(8);
    });
});
