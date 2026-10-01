import { useEffect, useState } from 'react';
import { createListeners } from './listeners';
import { BOARD_DROPPED, BOARD_FILTER_FULL, BOARD_PHONE_DETAIL, BOARD_SERVER, CHECKS, MEMBERS, MONTH_CODE, PHONES } from '../mock/data';

/**
 * 🧪 **예시 자료를 쓰는 쪽** — 서버 문이 아직 없는 쪽만(멤버 대조 6단계 · 현황판 이사 reviews/31).
 *    쪽 머리의 `ExampleBand` 가 «예시 자료 — 서버 문은 N단계»를 적는다. 서버 문이 있는 쪽은 이 파일을 가져오지 않는다(`opsData` 검사).
 *    쓰기는 메모리만 바꾸고 다시 그린다 — 기록(`ops_audit`)에는 안 남는다(서버가 없으니).
 */
export const EXAMPLE_STAGE = { checks: '6단계 (멤버십)', board: '현황판 이사 (reviews/31) 뒤' } as const;

const now = () => new Date().toISOString();
const localDay = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
const todayDay = () => localDay(new Date());
/** 기한 +1달 — 남은 날이 있으면 그 위에 얹는다(오늘부터 다시 재지 않는다) */
const plusOneMonthFrom = (base: string | null) => {
    const t = base && base > todayDay() ? new Date(`${base}T12:00:00`) : new Date();
    t.setMonth(t.getMonth() + 1);
    return localDay(t);
};

const listeners = createListeners();
const notify = () => listeners.notify();

/** 예시 자료가 바뀌면 다시 그린다 — 메모리 변화를 그대로 알린다. 정리는 자기 듣기 하나만(`listeners.ts`) */
export function useExampleTick() {
    const [, setN] = useState(0);
    useEffect(() => listeners.add(() => setN(n => n + 1)), []);
}

export const example = {
    members: () => MEMBERS,
    phones: () => PHONES,
    checks: () => CHECKS,
    monthCode: () => MONTH_CODE,
    boardServer: () => BOARD_SERVER,
    boardPhoneDetail: (deviceId: string) => BOARD_PHONE_DETAIL[deviceId],
    boardFilterFull: (memberId: string) => BOARD_FILTER_FULL[memberId],
    boardDropped: () => BOARD_DROPPED,

    checkMember(memberId: string, ok: boolean) {
        const c = CHECKS.find(x => x.memberId === memberId); if (!c) return;
        c.checkedAt = now(); c.result = ok ? 'OK' : 'MISMATCH';
        if (ok) { const m = MEMBERS.find(x => x.id === memberId); if (m) m.paidUntil = plusOneMonthFrom(m.paidUntil); }
        notify();
    },
};
