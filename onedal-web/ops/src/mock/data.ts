import type { OpsMember, OpsMemberCheck, OpsPhone } from '@onedal/shared';

/**
 * 🧪 **예시 자료 — 세 사람(기사님 · 딸 · 와이프) · 폰 넷 · 콜 몇 건** (reviews/29 «가족 1차판»).
 *    서버 문이 아직 없는 쪽(멤버 대조 · 현황판)만 `api/example.ts` 로 읽는다 — 서버 쪽은 이 파일을 모른다.
 *    🔴 이름 · 전화 · 주소는 전부 지어낸 것이다. 가족 1차판이라 관리자는 원문을 본다 — 가림은 남을 받을 때 켠다(reviews/29 기준 3).
 */

const today = new Date();
const d = (daysAgo: number, hh = 9, mm = 0) => {
    const t = new Date(today); t.setDate(t.getDate() - daysAgo); t.setHours(hh, mm, 0, 0); return t.toISOString();
};
const localDay = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

export const MEMBERS: OpsMember[] = [
    {
        id: 'm-driver1', name: '기사님 (기사1)', email: 'driver1@example.com', phone: '010-1111-2222', vehicle: '1t',
        networks: ['insung', 'hwamul24', 'kakaopicker'], role: 'USER',
        createdAt: d(40), approvedAt: d(40, 10), suspendedAt: null, suspendAfterActive: false, withdrawnAt: null,
        paidUntil: null, autoAllowedAt: d(40, 10), autoUntil: null, statsAllowedAt: d(40, 10), statsUntil: null, opsAllowedAt: d(40, 10), phones: [],
    },
    {
        id: 'm-driver2', name: '딸 (기사2)', email: 'driver2@example.com', phone: '010-3333-4444', vehicle: '다마스',
        networks: ['insung', 'kakaopicker'], role: 'USER',
        createdAt: d(3, 21, 12), approvedAt: d(2, 8, 30), suspendedAt: null, suspendAfterActive: false, withdrawnAt: null,
        paidUntil: null, autoAllowedAt: d(2, 8, 30), autoUntil: null, statsAllowedAt: d(2, 8, 30), statsUntil: null, opsAllowedAt: null, phones: [],
    },
    {
        id: 'm-admin', name: '와이프 (관리자)', email: 'admin@example.com', phone: '010-5555-6666', vehicle: '',
        networks: [], role: 'ADMIN',
        createdAt: d(40), approvedAt: d(40), suspendedAt: null, suspendAfterActive: false, withdrawnAt: null,
        paidUntil: null, autoAllowedAt: null, autoUntil: null, statsAllowedAt: null, statsUntil: null, opsAllowedAt: d(40), phones: [],
    },
    {
        id: 'm-pending', name: '신청자 (예시)', email: 'new@example.com', phone: '010-7777-8888', vehicle: '라보',
        networks: ['hwamul24'], role: 'USER',
        createdAt: d(0, 7, 41), approvedAt: null, suspendedAt: null, suspendAfterActive: false, withdrawnAt: null,
        paidUntil: null, autoAllowedAt: null, autoUntil: null, statsAllowedAt: null, statsUntil: null, opsAllowedAt: null, phones: [],
    },
];

export const PHONES: OpsPhone[] = [
    { deviceId: 'd-3f1c9a2e-7b4d-4e8a-9c1d-0a6b2e5f7c11', deviceName: '기사님 배차망 폰', memberId: 'm-driver1', status: 'ONLINE', offlineReason: null, lastSeenAt: d(0, 9, 58), appVersion: '2.9.12', mode: 'AUTO', locationOn: false },
    { deviceId: 'd-8e2d4b71-1c3a-4f0e-b5d2-6a9c1e3f4b22', deviceName: '기사님 운전석 폰', memberId: 'm-driver1', status: 'ONLINE', offlineReason: null, lastSeenAt: d(0, 9, 59), appVersion: '1.0', mode: 'AUTO', locationOn: true },
    { deviceId: 'd-5a7c2e19-9d4b-4a3c-8e1f-2b6d9c0a7e33', deviceName: '딸 배차망 폰', memberId: 'm-driver2', status: 'OFFLINE', offlineReason: '앱 꺼짐 (접근성 해제)', lastSeenAt: d(0, 8, 12), appVersion: '2.9.11', mode: 'ALARM', locationOn: false },
    { deviceId: 'd-1b9e6c48-3f2a-4d7b-a0c5-7e4f1a8d2c44', deviceName: '딸 운전석 폰', memberId: 'm-driver2', status: 'ONLINE', offlineReason: null, lastSeenAt: d(0, 9, 57), appVersion: '1.0', mode: 'ALARM', locationOn: true },
];
for (const m of MEMBERS) m.phones = PHONES.filter(p => p.memberId === m.id);

const thisMonth = localDay(today).slice(0, 7);
export const CHECKS: OpsMemberCheck[] = [
    { memberId: 'm-driver1', month: thisMonth, codeEntered: null, checkedAt: null, result: null },
    { memberId: 'm-driver2', month: thisMonth, codeEntered: '4821', checkedAt: null, result: null },
    { memberId: 'm-pending', month: thisMonth, codeEntered: '4812', checkedAt: null, result: null },
];
export const MONTH_CODE = '4821';

/** 🧰 현황판(점검) 예시 — 서버 /api/health 와 폰 보고(지문 · 성적표 · 누적)가 주는 것의 모양 */
export const BOARD_SERVER = { bootedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), commit: 'a9eb50c1', branch: 'main', sockets: 3, lastScrapAt: new Date(Date.now() - 4000).toISOString(), db: 'data.db', tz: 'Asia/Seoul' };
export const BOARD_PHONE_DETAIL: Record<string, { filterHash: string; filterAgeSec: number; scansPerMin: number; lastList: string; listCount: number; tally: { seen: number; passed: number; blockedFare: number; blockedArea: number; blockedVehicle: number }; cumulative: { collected: number; accepted: number; cancels: number; cancelLimit: number }; screenOn: boolean; nodeCount: number }> = {
    'd-3f1c9a2e-7b4d-4e8a-9c1d-0a6b2e5f7c11': { filterHash: '7f3a…c9', filterAgeSec: 41, scansPerMin: 28, lastList: '인성 콜리스트', listCount: 37, tally: { seen: 212, passed: 9, blockedFare: 140, blockedArea: 51, blockedVehicle: 12 }, cumulative: { collected: 1240, accepted: 4, cancels: 1, cancelLimit: 3 }, screenOn: true, nodeCount: 412 },
    'd-5a7c2e19-9d4b-4a3c-8e1f-2b6d9c0a7e33': { filterHash: '7f3a…c9', filterAgeSec: 3600, scansPerMin: 0, lastList: '(접근성 꺼짐)', listCount: 0, tally: { seen: 0, passed: 0, blockedFare: 0, blockedArea: 0, blockedVehicle: 0 }, cumulative: { collected: 210, accepted: 0, cancels: 0, cancelLimit: 3 }, screenOn: false, nodeCount: 0 },
};
export const BOARD_FILTER_FULL: Record<string, object> = {
    'm-driver1': { isActive: true, minFare: 30000, radiusKm: 12, destinations: ['이천시', '여주시'], excludedKeywords: ['냉동', '이사'], vehicle: '1t', capacityBoxes: 100, pickupSlackMin: 20, safeCancelSec: { insung: 180, hwamul24: 120 }, phase: 'GATHERING' },
    'm-driver2': { isActive: true, minFare: 8000, radiusKm: 6, destinations: ['성남시 분당구'], excludedKeywords: [], vehicle: '다마스', capacityBoxes: 30, pickupSlackMin: 15, safeCancelSec: { insung: 180 }, phase: 'GATHERING' },
};
export const BOARD_DROPPED = [
    { at: new Date(Date.now() - 60000 * 3).toISOString(), memberId: 'm-driver1', app: '인성', line: '광주 초월 → 서울 강남 · 38,000 · 1t', why: '목적지 밖 (강남)' },
    { at: new Date(Date.now() - 60000 * 7).toISOString(), memberId: 'm-driver1', app: '인성', line: '이천 부발 → 여주 · 22,000 · 다마스', why: '요금 미달 (30,000)' },
    { at: new Date(Date.now() - 60000 * 9).toISOString(), memberId: 'm-driver2', app: '픽커', line: '분당 정자 → 수지 · 6,500 · 도보', why: '요금 미달 (8,000)' },
    { at: new Date(Date.now() - 60000 * 15).toISOString(), memberId: 'm-driver1', app: '24시', line: '여주 가남 → 가락시장 · 70,000 · 1t 냉동', why: '제외 낱말 (냉동)' },
];
