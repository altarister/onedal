import type {
    OpsAnomaly, OpsAudit, OpsCall, OpsContent, OpsMember, OpsMemberCheck, OpsNotice, OpsPhone, OpsRelease, OpsScreenWord,
} from '@onedal/shared';

/**
 * 🧪 **예시 자료 — 세 사람(기사님 · 딸 · 와이프) · 폰 넷 · 콜 몇 건** (reviews/29 «가족 1차판»).
 *    «실제로 돌면 이렇게 보인다»를 보이기 위한 것이다. 서버 문 `/api/ops/*` 가 생기면 `api/ops.ts` 가 이 파일 대신 서버를 읽는다.
 *    🔴 이름 · 전화 · 주소는 전부 지어낸 것이다. 가족 1차판이라 관리자는 원문을 본다 — 가림은 남을 받을 때 켠다(reviews/29 기준 3).
 */

const today = new Date();
const d = (daysAgo: number, hh = 9, mm = 0) => {
    const t = new Date(today); t.setDate(t.getDate() - daysAgo); t.setHours(hh, mm, 0, 0); return t.toISOString();
};
const plusDays = (n: number) => { const t = new Date(today); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const tomorrowName = DAY_NAMES[(today.getDay() + 1) % 7];

export const MEMBERS: OpsMember[] = [
    {
        id: 'm-driver1', name: '기사님 (기사1)', email: 'driver1@example.com', phone: '010-1111-2222', vehicle: '1t',
        networks: ['insung', 'hwamul24', 'kakaopicker'], region: '광주 · 이천 · 여주', youtubeChannel: null, role: 'USER',
        createdAt: d(40), approvedAt: d(40, 10), suspendedAt: null, suspendAfterActive: false, withdrawnAt: null,
        paidUntil: null, autoUntil: plusDays(365), statsUntil: plusDays(365), opsAllowedAt: d(40, 10), phones: [],
    },
    {
        id: 'm-driver2', name: '딸 (기사2)', email: 'driver2@example.com', phone: '010-3333-4444', vehicle: '다마스',
        networks: ['insung', 'kakaopicker'], region: '성남 · 광주', youtubeChannel: '화물기사 2호', role: 'USER',
        createdAt: d(3, 21, 12), approvedAt: d(2, 8, 30), suspendedAt: null, suspendAfterActive: false, withdrawnAt: null,
        paidUntil: plusDays(23), autoUntil: plusDays(365), statsUntil: plusDays(365), opsAllowedAt: null, phones: [],
    },
    {
        id: 'm-admin', name: '와이프 (관리자)', email: 'admin@example.com', phone: '010-5555-6666', vehicle: '',
        networks: [], region: '', youtubeChannel: null, role: 'ADMIN',
        createdAt: d(40), approvedAt: d(40), suspendedAt: null, suspendAfterActive: false, withdrawnAt: null,
        paidUntil: null, autoUntil: null, statsUntil: null, opsAllowedAt: d(40), phones: [],
    },
    {
        id: 'm-pending', name: '신청자 (예시)', email: 'new@example.com', phone: '010-7777-8888', vehicle: '라보',
        networks: ['hwamul24'], region: '용인', youtubeChannel: '라보왕', role: 'USER',
        createdAt: d(0, 7, 41), approvedAt: null, suspendedAt: null, suspendAfterActive: false, withdrawnAt: null,
        paidUntil: null, autoUntil: null, statsUntil: null, opsAllowedAt: null, phones: [],
    },
];

export const PHONES: OpsPhone[] = [
    { deviceId: 'd-3f1c9a2e-7b4d-4e8a-9c1d-0a6b2e5f7c11', deviceName: '기사님 배차망 폰', memberId: 'm-driver1', status: 'ONLINE', offlineReason: null, lastSeenAt: d(0, 9, 58), appVersion: '2.9.12', mode: 'AUTO', locationOn: false },
    { deviceId: 'd-8e2d4b71-1c3a-4f0e-b5d2-6a9c1e3f4b22', deviceName: '기사님 운전석 폰', memberId: 'm-driver1', status: 'ONLINE', offlineReason: null, lastSeenAt: d(0, 9, 59), appVersion: '1.0', mode: 'AUTO', locationOn: true },
    { deviceId: 'd-5a7c2e19-9d4b-4a3c-8e1f-2b6d9c0a7e33', deviceName: '딸 배차망 폰', memberId: 'm-driver2', status: 'OFFLINE', offlineReason: '앱 꺼짐 (접근성 해제)', lastSeenAt: d(0, 8, 12), appVersion: '2.9.11', mode: 'ALARM', locationOn: false },
    { deviceId: 'd-1b9e6c48-3f2a-4d7b-a0c5-7e4f1a8d2c44', deviceName: '딸 운전석 폰', memberId: 'm-driver2', status: 'ONLINE', offlineReason: null, lastSeenAt: d(0, 9, 57), appVersion: '1.0', mode: 'ALARM', locationOn: true },
];
for (const m of MEMBERS) m.phones = PHONES.filter(p => p.memberId === m.id);

export const CALLS: OpsCall[] = [
    {
        id: 'c-101', memberId: 'm-driver1', targetApp: 'insung', status: 'ORDER_CONFIRMED', verdict: '꿀', needsCall: true,
        pickup: { place: '곤지암 물류센터', phone: '031-760-0000', address: '경기 광주시 곤지암읍 곤지암리 123-4 물류센터 B동', at: d(0, 10, 30) },
        dropoff: { place: '관고동 ○○상사', phone: '031-630-0000', address: '경기 이천시 관고동 55-2 ○○상사', at: null },
        fare: 45000, capturedAt: d(0, 9, 41), callNote: null,
    },
    {
        id: 'c-102', memberId: 'm-driver1', targetApp: 'kakaopicker', status: 'ORDER_CONFIRMED', verdict: '보통', needsCall: false,
        pickup: { place: '초월 편의점', phone: null, address: '경기 광주시 초월읍 대쌍령리 88 편의점', at: d(0, 11, 0) },
        dropoff: { place: '수하인 (개인)', phone: '010-2222-1234', address: '경기 이천시 부발읍 아미리 302-1 3층', at: null },
        fare: 12000, capturedAt: d(0, 9, 50),
        callNote: { cargoSize: '박스 2 (라면박스 기준 4)', pickupReadyAt: d(0, 10, 50), counterpartCancelled: false, memo: '뒷문으로 오라고 함', writtenBy: '와이프 (관리자)', writtenAt: d(0, 9, 55) },
    },
    {
        id: 'c-103', memberId: 'm-driver2', targetApp: 'insung', status: 'ORDER_CONFIRMED', verdict: '똥', needsCall: true,
        pickup: { place: '성남 야탑 ○○물산', phone: '031-700-0000', address: '경기 성남시 분당구 야탑동 341 ○○물산', at: d(0, 13, 0) },
        dropoff: { place: '광주 오포 ○○공장', phone: '031-760-1111', address: '경기 광주시 오포읍 능평리 17-3 공장', at: null },
        fare: 28000, capturedAt: d(0, 9, 30), callNote: null,
    },
    {
        id: 'c-104', memberId: 'm-driver2', targetApp: 'kakaopicker', status: 'ORDER_DELIVERED', verdict: '보통', needsCall: false,
        pickup: { place: '판교 ○○카페', phone: null, address: '경기 성남시 분당구 판교동 632 카페', at: d(0, 8, 0) },
        dropoff: { place: '수하인 (개인)', phone: '010-3333-5678', address: '경기 성남시 수정구 태평동 1201 402호', at: d(0, 8, 40) },
        fare: 9000, capturedAt: d(0, 7, 45), callNote: null,
    },
    {
        id: 'c-105', memberId: 'm-driver1', targetApp: 'hwamul24', status: 'ORDER_CANCELLED', verdict: '사고', needsCall: false,
        pickup: { place: '여주 ○○농산', phone: '031-880-0000', address: '경기 여주시 가남읍 태평리 90 농산', at: d(1, 15, 0) },
        dropoff: { place: '가락시장', phone: null, address: '서울 송파구 가락동 600 가락시장 채소동', at: null },
        fare: 70000, capturedAt: d(1, 14, 10),
        callNote: { cargoSize: '팔레트 1', pickupReadyAt: null, counterpartCancelled: true, memo: '상대가 다른 차 잡았다고 함', writtenBy: '와이프 (관리자)', writtenAt: d(1, 14, 20) },
    },
];

export const ANOMALIES: OpsAnomaly[] = [
    { id: 1, at: d(0, 9, 12), memberId: 'm-driver2', deviceId: 'd-5a7c2e19-9d4b-4a3c-8e1f-2b6d9c0a7e33', targetApp: 'insung', screen: '상세', reason: '상세 화면을 못 읽음 — 팝업이 250ms 안에 안 뜸' },
    { id: 2, at: d(0, 8, 50), memberId: 'm-driver1', deviceId: 'd-3f1c9a2e-7b4d-4e8a-9c1d-0a6b2e5f7c11', targetApp: 'kakaopicker', screen: '목록', reason: '사진 읽기 실패 (글자 깨짐)' },
    { id: 3, at: d(1, 17, 3), memberId: 'm-driver1', deviceId: 'd-3f1c9a2e-7b4d-4e8a-9c1d-0a6b2e5f7c11', targetApp: 'hwamul24', screen: '목록', reason: '요금 칸 없음' },
    { id: 4, at: d(1, 9, 30), memberId: null, deviceId: 'd-00000000-0000-4000-8000-0000000000ff', targetApp: 'insung', screen: '목록', reason: '연결 안 된 폰의 보고 — 거절함' },
    { id: 5, at: d(2, 12, 0), memberId: 'm-driver2', deviceId: 'd-5a7c2e19-9d4b-4a3c-8e1f-2b6d9c0a7e33', targetApp: 'insung', screen: '팝업', reason: '결재 «닫기» 뒤 목록 복귀 안 됨' },
];

export const SCREEN_WORDS: OpsScreenWord[] = [
    { targetApp: 'insung', page: '목록', word: '급송', kind: '정의 밖', firstSeenAt: d(0, 8, 20) },
    { targetApp: 'insung', page: '상세', word: '착불', kind: '정의 밖', firstSeenAt: d(0, 8, 21) },
    { targetApp: 'kakaopicker', page: '목록', word: '픽업완료', kind: '잡음', firstSeenAt: d(1, 10, 0) },
    { targetApp: 'hwamul24', page: '목록', word: '혼적', kind: '정의 밖', firstSeenAt: d(1, 16, 40) },
    { targetApp: 'insung', page: '팝업', word: '재배차', kind: '남은 토막', firstSeenAt: d(2, 9, 0) },
];

export const CONTENTS: OpsContent[] = [
    { kind: 'terms', title: '서비스 약관', body: '', version: 0, updatedAt: '' },
    { kind: 'privacy', title: '개인정보 처리방침', body: '', version: 0, updatedAt: '' },
    { kind: 'location', title: '위치정보 이용약관', body: '', version: 0, updatedAt: '' },
    { kind: 'joinGuide', title: '가입 안내', body: '1DAL 은 배차망(인성 · 화물24시 · 픽커)의 콜을 읽어 좋은 콜을 알려 주는 도구입니다.\n가족 1차판 — 관리자 승인 뒤 쓸 수 있습니다.', version: 1, updatedAt: d(2, 20, 0) },
    { kind: 'installGuide', title: '설치 안내', body: '', version: 0, updatedAt: '' },
    { kind: 'withdrawGuide', title: '탈퇴 안내', body: '', version: 0, updatedAt: '' },
];

export const NOTICES: OpsNotice[] = [
    { id: 1, text: `내일(${tomorrowName}) 새벽 2~3시 서버 점검 — 그 시간엔 알람이 안 울립니다`, postedAt: d(0, 7, 0), activeUntil: plusDays(1) },
    { id: 2, text: '원달앱 2.9.12 로 올려 주세요 — 픽커 사진 읽기가 좋아졌습니다', postedAt: d(3, 9, 0), activeUntil: null },
];

export const RELEASES: OpsRelease[] = [
    { app: 'scanner', version: '2.9.12', versionCode: 59, fileName: 'onedal-app-2.9.12.apk', sha256: 'a3f9…c1e2', uploadedAt: d(3, 8, 40), isLatest: true, isMinimum: false },
    { app: 'scanner', version: '2.9.11', versionCode: 58, fileName: 'onedal-app-2.9.11.apk', sha256: '77b0…9d4a', uploadedAt: d(10, 8, 40), isLatest: false, isMinimum: true },
    { app: 'dashboard', version: '1.0', versionCode: 1, fileName: 'onedal-dashboard-1.0.apk', sha256: '0c1d…ee31', uploadedAt: d(10, 8, 45), isLatest: true, isMinimum: true },
];

export const AUDIT: OpsAudit[] = [
    { id: 8, at: d(0, 9, 55), admin: '와이프 (관리자)', action: '통화 결과 적음', targetMemberId: 'm-driver1', detail: 'c-102 · 박스 2 · 10:50 상차 가능' },
    { id: 7, at: d(0, 9, 40), admin: '와이프 (관리자)', action: '위치 봄', targetMemberId: 'm-driver2', detail: '/map' },
    { id: 6, at: d(0, 7, 5), admin: '와이프 (관리자)', action: '공지 올림', targetMemberId: null, detail: '서버 점검 안내' },
    { id: 5, at: d(2, 8, 30), admin: '와이프 (관리자)', action: '승인', targetMemberId: 'm-driver2', detail: '멤버 확인 번호 일치 · 기한 +1달' },
    { id: 4, at: d(2, 20, 0), admin: '와이프 (관리자)', action: '페이지 글 적음', targetMemberId: null, detail: '가입 안내 v1' },
    { id: 3, at: d(3, 8, 40), admin: '와이프 (관리자)', action: 'APK 올림', targetMemberId: null, detail: '원달앱 2.9.12 (최신)' },
    { id: 2, at: d(3, 9, 0), admin: '와이프 (관리자)', action: '공지 올림', targetMemberId: null, detail: '원달앱 업데이트 안내' },
    { id: 1, at: d(1, 14, 25), admin: '와이프 (관리자)', action: '콜 봄', targetMemberId: 'm-driver1', detail: 'c-105 · 취소 사유 확인' },
];

const thisMonth = today.toISOString().slice(0, 7);
export const CHECKS: OpsMemberCheck[] = [
    { memberId: 'm-driver1', month: thisMonth, codeEntered: null, checkedAt: null, result: null },
    { memberId: 'm-driver2', month: thisMonth, codeEntered: '4821', checkedAt: d(2, 8, 30), result: 'OK' },
    { memberId: 'm-pending', month: thisMonth, codeEntered: '4812', checkedAt: null, result: null },
];
export const MONTH_CODE = '4821';

export const KAKAO_USAGE: Record<string, { today: number; month: number }> = {
    'm-driver1': { today: 63, month: 1240 },
    'm-driver2': { today: 18, month: 210 },
};

export const STATS_ROWS = [
    { group: '월', from: '광주시', to: '이천시', calls: 41, fareAvg: 43800, memberId: 'm-driver1' },
    { group: '월', from: '광주시', to: '성남시 분당구', calls: 23, fareAvg: 31200, memberId: 'm-driver1' },
    { group: '월', from: '성남시 분당구', to: '광주시', calls: 17, fareAvg: 27500, memberId: 'm-driver2' },
    { group: '화', from: '이천시', to: '여주시', calls: 12, fareAvg: 38900, memberId: 'm-driver1' },
    { group: '화', from: '성남시 수정구', to: '성남시 분당구', calls: 9, fareAvg: 9500, memberId: 'm-driver2' },
];
