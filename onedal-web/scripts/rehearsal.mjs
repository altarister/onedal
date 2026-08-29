#!/usr/bin/env node
/**
 * 🎭 리허설 — **앱 없이** 서버(4000) + 관제웹(3000)만으로 시뮬레이션한다.
 *
 * 기사님 (2026-08-18): *"내가 시뮬레이터 테스트하려니까 너무 오래 걸리고 재현이 어렵다.
 * localhost:3000 화면을 보고 싶은 거야. 시나리오처럼 내가 값을 넣고 수락 혹은 취소를 하는 거지."*
 *
 * 이 스크립트가 **앱폰 역할**을 한다:
 *   · 메뉴에서 고른 콜을 1차 선점(/orders/confirm) → 2차 상세(/orders/detail)로 올린다
 *   · 5초마다 텔레메트리(/api/scrap)를 보내 피기백 판결을 ACK 한다 (진짜 앱과 같은 왕복)
 *   · 올리기 전에 **앱과 같은 규칙**(경로 순서 판정)을 돌려 차단될 콜인지 먼저 알려 준다
 *
 * 기사님은 관제웹(localhost:3000)에서 카드가 뜨면 평소처럼 KEEP/CANCEL 을 누르고,
 * 출발·모의 주행·하차 완료도 관제웹에서 그대로 한다. GPS 는 관제웹 목업 주행이 담당한다.
 *
 * ⚠️ 개발 서버(4000)·local.db 에 **진짜로 기록된다** — 그게 목적이다 (관제웹에서 보이려면).
 *    끝나고 지우고 싶으면 "콜 리스트 지워줘" 하면 된다.
 *
 * 실행:  cd onedal-web && pnpm rehearsal
 */
import { createInterface } from 'node:readline';
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { restartServer } from './lib/restartServer.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'server/index.js'));
const Database = require('better-sqlite3');

const PORT = process.env.REHEARSAL_PORT || 4000;
const BASE = `http://localhost:${PORT}`;

// ── 기기: 실제 등록된 앱폰과 다른 전용 ID 를 쓰면 미등록이라 막힌다 → DB 에서 실물을 읽는다
const db = new Database(join(ROOT, 'server/local.db'), { readonly: true });
const dev = db.prepare(`SELECT device_id FROM user_devices LIMIT 1`).get();
if (!dev) { console.error('🔴 등록된 기기가 없습니다. 관제웹에서 PIN 연동을 먼저 하세요.'); process.exit(1); }
const DEVICE = dev.device_id;

// ── 콜 재료: 지오코딩 캐시에 있는 실제 주소만 쓴다 (카카오 지오코딩 호출 없이 바로 좌표가 잡힌다)
const cached = db.prepare(`SELECT query FROM geocode_cache WHERE query LIKE '%시%' ORDER BY hit_count DESC LIMIT 200`)
    .all().map(r => r.query);
db.close();
const pick = (needle) => cached.find(q => q.includes(needle));

/**
 * 자주 쓰는 무대 — 광주 출발 → 파주 노선 (기사님 평소 시뮬레이션과 같은 그림).
 * 주소는 전부 geocode_cache 실물 — 1~5 는 잡는 흐름, 6~10 은 걸러져야 하는 것들.
 */
const PRESETS = [
    // ── 잡는 흐름 ──
    { key: '1', label: '첫짐 꿀 · 광주 경안동 → 파주 금촌동 (10만/1t) — 🔵 나와야 정상',
      pickup: pick('경안동 204-5'), dropoff: pick('금촌동 905-1'), fare: 100000, vehicleType: '1t' },
    { key: '2', label: '첫짐 똥 · 광주 경안동 → 파주 문산읍 (5.5만/1t · 저단가) — 🟡 나와야 정상',
      pickup: pick('경안동 493-4'), dropoff: pick('문산역'), fare: 55000, vehicleType: '1t' },
    { key: '3', label: '합짐 순방향 소형 · 광주 목현동 → 파주 문발동 (3만/다마스)',
      pickup: pick('목현동'), dropoff: pick('회동길 145'), fare: 30000, vehicleType: '다마스' },
    { key: '4', label: '합짐 순방향 · 광주 초월읍 → 파주 탄현면 아울렛 (9만/오토바이)',
      pickup: pick('초월읍 경충대로 2073'), dropoff: pick('신세계사이먼'), fare: 90000, vehicleType: '오토바이' },
    { key: '5', label: '합짐 중간 상차 · 고양 일산 웨스턴돔 → 파주 야당동 (4만/라보) — 경로 후반끼리',
      pickup: pick('웨스턴돔'), dropoff: pick('야당동'), fare: 40000, vehicleType: '라보' },

    // ── 걸러져야 하는 것들 ──
    { key: '6', label: '역주행 · 파주 금촌동 → 광주 경안동 — 🔴 차단돼야 정상',
      pickup: pick('금촌동 768-2'), dropoff: pick('경안동 167-1'), fare: 90000, vehicleType: '오토바이' },
    { key: '7', label: '경로 밖 상차 · 성남 판교 → 파주 탄현면 — 🔴 차단돼야 정상',
      pickup: pick('판교역로 146'), dropoff: pick('쿠팡 파주'), fare: 80000, vehicleType: '오토바이' },
    { key: '8', label: '우회 큰 합짐 · 광주 남한산성 → 파주 법원읍 (7만/다마스) — 우회 커서 낮은 점수',
      pickup: pick('남한산성'), dropoff: pick('법원읍'), fare: 70000, vehicleType: '다마스' },
    { key: '9', label: '적재 초과 · 광주 송정동 → 파주 월롱면 (8만/1t짐) — 첫짐 있으면 차종에서 걸림',
      pickup: pick('송정동 행정타운로'), dropoff: pick('월롱면'), fare: 80000, vehicleType: '1t' },
    { key: '10', label: '역방향 장거리 · 파주 임진각 → 성남 판교 (12만/1t) — 노선 정반대',
      pickup: pick('임진각'), dropoff: pick('판교역로 235'), fare: 120000, vehicleType: '1t' },

    /**
     * 🛣️ **주행 중 합짐** — 출발한 뒤 경로 위에서 잡는 콜 (기사님 요청 2026-08-19).
     *
     * 광주 → 파주 경로가 남양주 다산동을 지난다 (실측 경유 목록에 `다산동` 이 든다).
     * 그 중간 지점에서 상차해 종점 쪽(파주시청)으로 가므로, **이미 달리는 길 위에**
     * 붙는 합짐이다 — 순서 판정(progressKm)·우회 비용·적재가 한꺼번에 걸린다.
     * 오토바이 짐이라 1t 첫짐을 실은 뒤에도 남은 칸에 들어간다.
     *
     * 좌표는 카카오 실측을 캐시에 넣은 것이다 (지어낸 값이 아니다).
     */
    { key: '11', label: '주행중 합짐 · 남양주 다산역 → 파주시청 (4만/오토바이) — 출발 후 경로 위에서 잡기',
      pickup: pick('다산역'), dropoff: pick('파주시청'), fare: 40000, vehicleType: '오토바이' },

    /**
     * ⏱️ **짧은 콜 — 150% 시한 확인용** (기사님 요청 2026-08-21).
     *
     * 광주 → 성남 판교는 주행 30분 안팎이라 시한(주행×150%+픽업 20분 ≈ 65분)이
     * 우리 추정 약속(접근+여유30+상차+주행+휴게30 ≈ 100분↑)을 **깎는 그림**이 나온다.
     * 격자 뒤 칸의 ⚠️(시한 밖)와 당겨진 추천 칸을 여기서 눈으로 확인한다.
     * ⚠️ 첫짐으로 잡으려면 콜 필터 하차지가 성남을 받아야 한다 (오늘만 필터에서 변경).
     */
    { key: '12', label: '짧은 첫짐 · 광주 경안동 → 성남 판교 (4.5만/1t · 주행 ~30분) — ⏱️ 시한 깎임 확인',
      pickup: pick('경안동 204-5'), dropoff: pick('판교역로 235'), fare: 45000, vehicleType: '1t' },

    /**
     * 📼 **노하우 재현 — 소숙의 오전 4콜** (기사님 요청 2026-08-21).
     *
     * "(23) 퀵서비스 오전 픽업" 영상의 실제 콜 4개를 그대로 옮겼다. 두 시계 모델
     * (상차 시계: 주선사 · 배달 시계: 상차부터 150%)을 우리 화면이 재현하는지 본다:
     *   13 → 14 → 15 순서로 잡고, 첫 픽업 후 16을 잡으면 영상과 같은 아침이 된다.
     *   확인할 것: 상차버퍼가 통화 전 ~30분 안팎으로 서는가 · 15번은 적요의
     *   "10:00상차"가 상차 시계를 대체하는가 · 안중(14)의 배달 데드라인이 빠듯한가.
     * ⚠️ 주소가 캐시 밖(서울·평택·용인)이라 첫 주입 때 카카오 지오코딩이 한 번씩 돈다.
     *    콜 필터(파주 노선)에 막히면 "그래도 올릴까요"에 y — 영상 기사의 필터는 우리와 다르다.
     */
    { key: '13', label: '노하우① 서울 가산동 → 평택 진위면 (3만/승용차) — 잡고 43분 뒤 픽업했던 콜 (📍 시작 위치를 신림역으로 옮김)',
      pickup: '서울 금천구 가산동', dropoff: '경기 평택시 진위면', fare: 30000, vehicleType: '승용차',
      // 채점 조건 (시간체계 16-4): 시작 위치 신림/가산권 — 초월읍 기점이면 13번 접근이
      // 75분이라 문제지 자체가 왜곡된다. 신림역 실좌표 (지어낸 값 아님)
      start: { label: '신림역 (노하우 시작 위치)', lat: 37.4842, lng: 126.9294 } },
    { key: '14', label: '노하우② 영등포 양평동 → 평택 안중읍 (3.8만/승용차) — 블라인드("평택시")·배달 빠듯했던 콜',
      pickup: '서울 영등포구 양평동', dropoff: '경기 평택시 안중읍', fare: 38000, vehicleType: '승용차',
      memo: '평택 시내 (블라인드 — 실제는 안중읍)' },
    { key: '15', label: '노하우③ 영등포 문래동 → 용인 상갈동 (3.5만/승용차) — 10시 예약, 통화로 9:50에 당김',
      pickup: '서울 영등포구 문래동', dropoff: '경기 용인시 기흥구 상갈동', fare: 35000, vehicleType: '승용차',
      memo: '10:00상차 예약' },
    { key: '16', label: '노하우④ 가산 옆 3분 → 용인 지곡동 (3.5만/승용차) — 통화 0건이었던 콜 (첫 픽업 후 잡기)',
      pickup: '서울 금천구 가산디지털단지', dropoff: '경기 용인시 기흥구 지곡동', fare: 35000, vehicleType: '승용차' },

    /**
     * 🧭 **`pnpm drive` 와 «같은 콜» — 3콜을 한 경로에 싣는다** (기사님 지점 2026-08-29).
     *
     * 기사님: *"1번 콜과 2번 콜이 너무 멀었어"* — 앞 문제지는 26km 라 «다른 동네» 였다.
     * 실제 운행은 **좁은 구간에서 여러 콜을 줍는 것**이라, 기사님이 직접 뽑아 주신
     * 7개 지점으로 다시 짰다. 좌표는 전부 카카오가 그 이름으로 돌려준 실측값이다.
     * ```
     *   집 ─2.2─ 모다 ─3.7─ 성당 ─6.2─ 신둔 ─2.2─ 이조 ─1.6─ 제일 ─1.8─ 터미널  (17.6km)
     * ```
     * 전부 **다마스**(30박스) 라 3콜이 다 들어간다 (90/100).
     *
     * ⚠️ **순서대로 해야 한다** — 19 → (상차) → 20 → (상차) → 21.
     *    합짐이 «붙는 자리»가 다 다르고, 그게 이 문제지의 전부다.
     */
    { key: '19', label: '🚚 [1] 첫짐 · 모다아울렛 → 신둔농협 (5만/다마스) — KEEP 후 **상차 완료**, 그리고 출발',
      pickup: pick('모다아울렛 곤지암점'), dropoff: pick('신둔농협하나로마트 본점'),
      fare: 50000, vehicleType: '다마스',
      start: { label: '집 · 초월역동광뷰엘아파트', lat: 37.376687, lng: 127.294440 },
      expect: [
        '이 판의 전부는 **방문 순서**다 — 색은 판정이 정한다 (단정하지 않는다)',
        'KEEP → 상차 완료 → 출발. 신둔 쪽으로 달리기 시작한다',
      ] },
    { key: '20', label: '🚚 [2] 합짐1 · 곤지암성당 → 이천제일 (5만/다마스) — **달리는 중에** 올린다',
      pickup: pick('곤지암성당'), dropoff: pick('이천제일식자재마트'),
      fare: 50000, vehicleType: '다마스',
      expect: [
        '성당은 **가는 길목**이다 (집에서 5.9km · 신둔 가는 도중)',
        '✅ 성당 상차가 신둔 하차보다 **앞**에 오면 맞다 — 지나는 길에 줍는 것',
        'KEEP → 성당 도착 → 상차 완료 (이제 2콜 적재)',
      ] },
    { key: '21', label: '🚚 [3] 합짐2 · 이조갈비 → 이천터미널 (5만/다마스) — **신둔 2.4km 앞**에서 올린다',
      pickup: pick('이조갈비함흥냉면'), dropoff: pick('이천터미널'),
      fare: 50000, vehicleType: '다마스',
      expect: [
        '🔴 **여기가 순서가 갈리는 자리다.**',
        '   신둔 하차가 2.4km 앞인데 이조 상차는 4.5km 밖이다',
        '',
        '✅ 신둔 하차 → 이조 상차 → 제일 하차 → 터미널 하차    (7.9km · 지금 규칙)',
        '🔴 이조 상차 가 먼저 나오면 옛 규칙이다              (13.3km · 5.4km 더 감)',
        '',
        '3콜이 다 실려 있다 — 다마스 30박스 ×3 = 90/100',
      ] },
];

// ── 앱과 같은 규칙 (RouteOrderFilter.check 의 JS 판) — 올리기 전에 미리 알려 준다
function routeOrderCheck(pickupText, dropoffText, progressKm) {
    const entries = Object.entries(progressKm ?? {});
    if (entries.length === 0) return { passed: true, reason: '첫짐 — 순서 검사 없음' };
    const hit = (text) => entries.filter(([k]) => text.includes(k));
    const p = hit(pickupText);
    if (p.length === 0) return { passed: false, reason: '경로 밖 — 상차지가 경유 목록에 없음' };
    const pv = p.map(([, v]) => v).filter(v => v !== null);
    const dv = hit(dropoffText).map(([, v]) => v).filter(v => v !== null);
    if (pv.length === 0) return { passed: true, reason: '상차지 순서 미상 — 통과' };
    if (dv.length === 0) return { passed: true, reason: '하차지 순서 미상 — 통과' };
    const a = Math.max(...pv), b = Math.min(...dv);
    return a <= b
        ? { passed: true, reason: `순방향 — 상차 ${a.toFixed(1)}km → 하차 ${b.toFixed(1)}km` }
        : { passed: false, reason: `역주행 — 상차 ${a.toFixed(1)}km → 하차 ${b.toFixed(1)}km (${(a - b).toFixed(1)}km 후진)` };
}

// ── 텔레메트리 루프: 앱의 5초 왕복. 심사 중엔 DETAIL_CONFIRMED 로 보고해야
//    화면 이탈 감지(devices.ts)가 우리 콜을 강제 취소하지 않는다 — 실측으로 당했다 (송정동 콜)
let holdingOrderId = null;      // 심사 대기 중인 콜 (있으면 상세 화면인 척한다)
let pendingAck = null;
let lastFilter = null;
let lastFilterVersion = '';     // 🧭 피기백 v2 — 신앱처럼 버전을 실어 보낸다 (scenario 는 구프로토콜로 호환 검증)
let dumpAfterAck = false;   // KEEP 직후 전체 필터를 자동으로 펼치기 위한 표식

async function telemetry() {
    try {
        const body = {
            deviceId: DEVICE,
            data: [],
            screenContext: holdingOrderId ? 'DETAIL_CONFIRMED' : 'LIST',
            isHolding: !!holdingOrderId,
            filterVersion: lastFilterVersion,   // 🧭 v2 — 같으면 서버가 필터 본문을 생략한다
            ...(pendingAck ? { ackDecisionId: pendingAck } : {}),
        };
        pendingAck = null;
        const r = await fetch(`${BASE}/api/scrap`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const j = await r.json();
        if (j.filterVersion) lastFilterVersion = j.filterVersion;
        lastFilter = j.dispatchEngineArgs ?? lastFilter;   // 본문 없음 = 안 바뀜 — 저장본 유지 (신앱과 같은 동작)
        /**
         * 🔴 서버 응답의 판결 필드는 `decision` 이다 (scrap.ts `res.json({ decision: ... })`).
         *    `piggybackDecision` 을 읽고 있어 판결을 한 번도 못 받았고 → ACK 를 못 보냈고 →
         *    서버가 규칙 ②대로 55분간 5초마다 같은 KEEP 을 태워 보냈다 (2026-08-19 실측).
         *    tests/rules/routeOrderSingleSource.test.ts 가 응답 조립처와 이름을 대조한다.
         */
        const d = j.decision;
        if (d?.orderId) {
            console.log(`\n📦 판결 수신: ${d.action}  (${d.orderId.slice(0, 8)}) — ACK 보냅니다`);
            pendingAck = d.orderId;
            if (holdingOrderId === d.orderId) holdingOrderId = null;
            if (d.action === 'KEEP') dumpAfterAck = true;   // 잡혔다 — 재계산된 필터를 곧 펼친다
            prompt();
        } else if (dumpAfterAck) {
            // ACK 뒤 첫 응답 = KEEP 재계산(경유·적재·차종)이 반영된 필터다
            dumpAfterAck = false;
            console.log('\n🎯 콜을 잡았습니다 — 지금 앱으로 내려가는 필터:');
            showFilter();
            prompt();
        }
    } catch { /* 서버가 잠깐 없어도 다음 틱에 다시 */ }
}

/** 앱으로 내려가는 필터 **전체** — 콜을 잡으면 자동으로 이걸 펼쳐 보여준다 (기사님 2026-08-18) */
function showFilter() {
    const f = lastFilter;
    if (!f) { console.log('  (아직 필터 수신 전 — 잠시 후 다시)'); return; }
    const pk = f.progressKm ?? {};
    const nums = Object.values(pk).filter(v => v !== null).length;

    console.log('\n  ━━━ 📱 앱으로 내려가는 필터 (전체) ━━━');
    console.log(`  isActive(콜잡기)      ${f.isActive ? 'ON' : 'OFF'}`);
    console.log(`  dispatchPhase(국면)   ${f.dispatchPhase} · isSharedMode(합짐) ${f.isSharedMode}`);
    console.log(`  driverAction          ${f.driverAction ?? '-'}`);
    console.log(`  destinationCity       ${f.destinationCity || '(없음)'} · 하차 반경 ${f.destinationRadiusKm}km · 경유 ${f.detourRadiusKm}km`);
    console.log(`  pickupRadiusKm(상차)  ${f.pickupRadiusKm}km`);
    console.log(`  minFare/maxFare       ${f.minFare?.toLocaleString()} ~ ${f.maxFare?.toLocaleString()}원 · 콜할인율 ${f.callDiscountPct}%`);
    console.log(`  ratePerKm(단가표)     ${Object.entries(f.ratePerKm ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '(없음)'}`);
    console.log(`  allowedVehicleTypes   [${(f.allowedVehicleTypes ?? []).join(', ') || '비어 있음 — 만재라 아무것도 못 실음'}]`);
    console.log(`  적재                  ${f.slotsUsed}/100박스 · 신뢰도 ${f.capacityConfidence}`);
    console.log(`  excludedKeywords      [${(f.excludedKeywords ?? []).join(', ') || '없음'}]`);
    console.log(`  customCityFilters     ${(f.customCityFilters ?? []).length}개 — ${(f.customCityFilters ?? []).join(', ') || '없음'}`);

    const kw = f.destinationKeywords ?? [];
    console.log(`  destinationKeywords   ${kw.length}개 동:`);
    for (let i = 0; i < kw.length; i += 12) console.log(`     ${kw.slice(i, i + 12).join(' ')}`);

    const entries = Object.entries(pk).sort((a, b) => (a[1] ?? Infinity) - (b[1] ?? Infinity));
    console.log(`  progressKm(경로 순서) ${entries.length}개 (숫자 ${nums} · 순서모름 ${entries.length - nums}) — 출발점 기준 km:`);
    for (let i = 0; i < entries.length; i += 6)
        console.log(`     ${entries.slice(i, i + 6).map(([k, v]) => `${k} ${v === null ? '?' : v.toFixed(1)}`).join(' · ')}`);
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * 🔴 **앱은 상세 화면을 통짜 텍스트로 올린다** — 리허설도 그래야 한다 (2026-08-19).
 *
 * 기사님: *"상황상 연락처가 있어야 전화를 할 건데.. 왜 없을까?"*
 *
 * `detail.ts` 는 `if (rawText)` **안에서만** 상하차지 상세(고객·담당·전화1/2)를 만든다.
 * 리허설은 `order` 객체만 보내고 rawText 를 비워 두고 있어서, 그 블록이
 * **한 번도 실행되지 않았다.** 연락처가 없던 게 아니라 **파싱 경로를 안 탄 것**이다.
 *
 * 그래서 리허설에서는 결제수단·수수료·주소상세·재열람 대조(phone1 비교)까지
 * 전부 검사 밖에 있었다. 실콜에서만 도는 코드였다.
 *
 * ⚠️ 여기 값은 **가짜다.** 전화번호는 실제로 걸리지 않게 `010-0000-xxxx` 로 둔다.
 */
function storeName(addr) {
    // 주소 뒤쪽에서 번지(숫자·숫자-숫자)가 아닌 토큰을 상호로 본다.
    // "… 경안동 493-4 이마트 광주점" → "이마트 광주점" · "… 금촌동 905-1" → 없음
    const parts = String(addr).trim().split(/\s+/);
    const tail = [];
    for (let i = parts.length - 1; i >= 0 && tail.length < 2; i--) {
        if (/^\d+(-\d+)?(번지)?$/.test(parts[i]) || /^[가-힣]+(로|길|동|읍|면|리|구|시|군)$/.test(parts[i])) break;
        tail.unshift(parts[i]);
    }
    return tail.length ? tail.join(' ') : null;
}

function buildRawText(t, n) {
    const pName = storeName(t.pickup) ?? '리허설 상차지';
    const dName = storeName(t.dropoff) ?? '리허설 하차지';
    const pad = String(n).padStart(2, '0');
    return [
        '배차사 : 리허설 퀵',
        '배차화물전화 : 010-0000-0000',
        `요금 : ${t.fare.toLocaleString()}(신용)`,
        `차종 : ${t.vehicleType}`,
        // 🔴 적요는 여기다 — 서버 /detail 이 rawText 를 해부해 order 를 덮으므로
        //    (detail.ts `{ ...pendingOrder, ...parsedDetails }`), order.itemDescription 에
        //    실은 memo 는 이 줄에 지고 있었다. 15번 '10:00상차 예약' 이 안 뜨던 이유.
        `물품 : ${t.memo || '리허설 콜'}`,
        '',
        '[출발지상세]',
        `고객 : ${pName}`,
        `위치 : ${t.pickup}`,
        `전화1 : 010-0000-1${pad}`,
        '',
        '[도착지상세]',
        `고객 : ${dName}`,
        `위치 : ${t.dropoff}`,
        `전화1 : 010-0000-2${pad}`,
    ].join('\n');
}

/**
 * 📍 **시작 위치 이동** — 위치가 서버로 들어오는 문은 `dashboard-gps-update` 소켓
 * **하나뿐**이라(socketHandlers 주석), 리허설도 관제웹인 척 그 문으로 들어간다.
 * lifecycle.mjs 와 같은 방식: auth/bypass 토큰 + client-app 의 socket.io-client.
 * ⚠️ 관제웹 목업 주행이 GPS 를 쏘는 중이면 나중 값이 이긴다 — 시작 위치는
 *    문제지를 **시작하기 전**(운행 전)에 옮기는 용도다.
 */
let gpsSocket = null;
async function moveTo(start) {
    if (!gpsSocket) {
        const { io } = await import(join(ROOT, 'client-app/node_modules/socket.io-client/build/esm/index.js'));
        const { accessToken } = await (await fetch(`${BASE}/api/auth/bypass`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        })).json();
        gpsSocket = io(BASE, { auth: { token: accessToken }, transports: ['websocket'] });
        watchDriving(gpsSocket);   // 👁️ 이때부터 «지금 어디쯤인가» 를 찍는다
        await new Promise((res, rej) => {
            gpsSocket.once('connect', res);
            gpsSocket.once('connect_error', e => rej(new Error(e.message)));
            setTimeout(() => rej(new Error('소켓 연결 시간 초과')), 8000);
        });
    }
    gpsSocket.emit('dashboard-gps-update', { lat: start.lat, lng: start.lng, source: 'rehearsal-시작위치' });
    await new Promise(r => setTimeout(r, 1200));   // 서버가 필터 중심·경로를 재계산할 틈
    console.log(`  📍 현위치를 ${start.label} 로 옮겼습니다`);
}


/**
 * 👁️ **주행을 지켜본다 — «지금 어디쯤인가»** (2026-08-29 신설)
 *
 * 기사님: *"너가 주행경로를 보다가 위치에 다시 콜을 올려주고"*
 *
 * 합짐은 **아무 때나 올리면 안 된다.** 2026-08-25 사고는 «하차지 코앞에서 새 콜이
 * 붙는» 순간에 났다. 그 순간을 맞추려면 지금 위치와 남은 정거장까지의 거리를 봐야 한다.
 *
 * 목업 주행이 도는 동안 서버는 `sync-active-orders` 로 현위치·정거장을 계속 보낸다.
 * 그걸 듣고 **거리가 눈에 띄게 바뀔 때만** 한 줄 찍는다 (매초 찍으면 로그가 묻힌다).
 */
const R = 6371, RAD = Math.PI / 180;
const distKm = (a, b) => {
    const h = Math.sin((b.y - a.y) * RAD / 2) ** 2
        + Math.cos(a.y * RAD) * Math.cos(b.y * RAD) * Math.sin((b.x - a.x) * RAD / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};
/**
 * 👁️ **«지금 올릴 때다» 를 알려 주는 신호** (2026-08-29 신설)
 *
 * 기사님: *"너가 주행경로를 보다가 위치에 다시 콜을 올려주고"*
 *
 * 합짐은 아무 때나 올리면 안 된다. 2026-08-25 사고는 **하차지 코앞에서 새 콜이 붙는**
 * 순간에 났다. 그 순간을 맞춰야 같은 그림이 된다.
 *
 * 🔴 **현위치는 소켓으로 되돌아오지 않는다** — `sync-active-orders` 의 반환 키에 없고
 *    (`buildOrderSync` 확인), 서버가 위치를 되쏘는 이벤트도 없다. 관제웹은 자기가 쏜
 *    좌표를 자기가 아니까 되받을 이유가 없어서다. **없는 이벤트를 지어내지 않는다** (규칙 ④).
 *
 * → 대신 **근접 예고**(`next-stop-approaching`)를 듣는다. 서버가 다음 정거장 **3km 앞**
 *   에서 한 번 울리는 신호다 (`GPS_ARRIVAL.NOTICE_KM`). 그게 곧 «코앞에 왔다» 이고,
 *   합짐을 올릴 자리다. 이벤트 이름은 `pnpm audit:socket` 목록과 대조했다.
 */
function watchDriving(sock) {
    sock.on('next-stop-approaching', (d) => {
        const 이름 = d?.stopType === 'pickup' ? '상차지' : '하차지';
        console.log(`\n  👁️ ────────────────────────────────────────────`);
        console.log(`  👁️  다음 정거장(${이름}) ${d?.distanceKm ?? '?'}km 앞 — **지금이 합짐을 올릴 자리다**`);
        console.log(`  👁️ ────────────────────────────────────────────\n`);
    });
}

let seq = 0;
async function inject(t) {
    if (t.start) {
        try { await moveTo(t.start); }
        catch (e) { console.log(`  ⚠️ 시작 위치 이동 실패 (${e.message}) — 현 위치 그대로 진행합니다`); }
    }
    if (!t.pickup || !t.dropoff) { console.log('  🔴 이 주소가 지오코딩 캐시에 없어 건너뜁니다'); return; }

    // 🔎 **무엇을 봐야 하는가** — 올리기 전에 먼저 말한다.
    //    기대를 모르고 화면을 보면 «뭔가 이상한데» 로 끝난다 (기사님 2026-08-29).
    if (t.expect?.length) {
        console.log('  ┌─ 이 콜에서 확인할 것');
        for (const line of t.expect) console.log(`  │ ${line}`);
        console.log('  └────────────────────────────');
    }

    // 앱이라면 잡았을까 — 올리기 전에 같은 규칙으로 미리 판정
    /**
     * 🔴 경로 순서만 보고 있었다 (2026-08-19 실측 사고). 그래서 허용 차종이
     *    [오토바이, 승용차]인 상태에서 1t 콜을 경고 없이 올렸고, 기사님이
     *    KEEP 해 **1t 화물 두 개가 잡혔다** — 실앱이라면 파서의 차종 검사가
     *    걸렀을 콜이다. 앱이 거르는 것(차종·요금·isActive)은 리허설도 거른다.
     */
    const blocks = [];
    const f = lastFilter;
    if (f) {
        if (f.isActive === false) blocks.push('콜 잡기 OFF (만석/홀드)');
        const av = f.allowedVehicleTypes;
        if (Array.isArray(av) && av.length === 0) blocks.push('허용 차종 없음 — 적재 만석');
        else if (Array.isArray(av) && av.length && t.vehicleType
                 && !av.some(a => t.vehicleType.includes(a) || a.includes(t.vehicleType)))
            blocks.push(`차종 ${t.vehicleType} — 허용 [${av.join(', ')}] 밖`);
        if (f.minFare && t.fare < f.minFare) blocks.push(`요금 ${t.fare.toLocaleString()}원 < 최저 ${f.minFare.toLocaleString()}원`);
    }
    const check = routeOrderCheck(t.pickup, t.dropoff, lastFilter?.progressKm);
    if (!check.passed) blocks.push(check.reason);
    console.log(`  🧭 앱 필터 판정: ${blocks.length === 0 ? `✅ 통과 — ${check.reason}` : `🔴 차단 — ${blocks.join(' · ')}`}`);
    if (blocks.length) {
        const yn = await ask('  앱이라면 안 올릴 콜입니다. 그래도 올릴까요? (y/N) ');
        if (yn.trim().toLowerCase() !== 'y') { console.log('  → 올리지 않았습니다 (앱과 같은 동작)'); return; }
    }
    if (lastFilter && !lastFilter.isActive) console.log('  ⚠️ 콜 잡기가 OFF 상태입니다 — 서버가 홀드 중이거나 필터가 꺼져 있습니다');

    const id = `REHEARSAL-${Date.now()}-${++seq}`;
    const order = {
        id, pickup: t.pickup, dropoff: t.dropoff, fare: t.fare, vehicleType: t.vehicleType,
        timestamp: new Date().toISOString(), itemDescription: t.memo || '리허설 콜',
        // 앱이 2차 상세 화면에서 긁어 올리는 통짜 텍스트 — 서버가 여기서 연락처를 뽑는다
        rawText: buildRawText(t, seq),
    };
    const base = { deviceId: DEVICE, capturedAt: new Date().toISOString(), matchType: 'AUTO' };
    const post = (path, body) => fetch(`${BASE}/api/orders${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });

    holdingOrderId = id;                      // 지금부터 상세 화면인 척 (화면 이탈 감지 회피)
    await post('/confirm', { ...base, step: 'BASIC', order });
    await new Promise(r => setTimeout(r, 500));
    await post('/detail', { ...base, step: 'DETAILED', order });
    console.log(`  📱 올렸습니다: ${t.pickup.split(' ').slice(0, 3).join(' ')} → ${t.dropoff.split(' ').slice(0, 3).join(' ')} · ${t.fare.toLocaleString()}원`);
    console.log(`  → 관제웹(localhost:3000)에 카드가 뜹니다. 안전취소 35초 안에 KEEP/CANCEL 하세요.`);
}

/**
 * 🧹 **오늘 처음처럼** — 콜과 콜에 딸린 기록만 지운다 (기사님 2026-08-18).
 * intel(수집 데이터 · 후속 콜 빈도 재료)과 places(거래처 장부), 설정은 남긴다.
 * 지우기 전에 WAL 포함 백업을 뜬다 — 언제든 되돌릴 수 있게.
 */
async function freshStart() {
    const src = new Database(join(ROOT, 'server/local.db'));
    const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '');
    const backup = join(ROOT, `server/local.db.backup-rehearsal-${stamp}`);
    await src.backup(backup);
    // 🔄 옛 장부 테이블은 철거됨 (2026-08-21) — 단계 행은 orders CASCADE 로 함께 지워진다
    for (const t of ['orderStops', 'orders']) {
        const n = src.prepare(`DELETE FROM ${t}`).run().changes;
        console.log(`  ${t}: ${n}건 삭제`);
    }
    src.close();
    console.log(`  백업: ${backup.split('/').pop()} · intel·places·설정은 그대로`);

    /**
     * 🔴 **장부를 비웠으면 메모리도 함께 비운다 — 한 동작이다** (2026-08-22 · 버그 대장 #40).
     *
     * 세션 메모리(`myOrders`·`pendingOrdersData`)의 옛 콜은 `buildOrderSync` 를 타고
     * 관제웹으로 계속 내려간다. 지워진 콜이 화면에 살아 있는 **유령**이 되고,
     * 새 콜을 하나 잡는 순간 그 유령들이 진행 중 탭으로 함께 소환된다.
     *
     * 예전에는 여기서 *"재기동해 주세요"* 하고 사람을 기다렸다. 그 한 칸을 사람이
     * 메우게 둔 것이 사고의 뿌리였다 — **도구가 스스로 한다.**
     */
    await restartServer({ base: BASE, entry: join(ROOT, 'server/src/index.ts') });
}

// ── 대화 루프 ─────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

function menu() {
    console.log('\n──── 🎭 리허설 (앱폰 역할) ────');
    console.log('\x1b[2m  17·18 은 `pnpm drive` 와 같은 조건이다 — 그 검사 결과와 대조해 보는 자리\x1b[0m');
    for (const p of PRESETS) console.log(`  [${p.key}] ${p.label}`);
    console.log('  [c] 직접 입력 (상차지·하차지·요금·차종)');
    console.log('  [f] 지금 필터 보기 (서버가 앱에 내려보내는 값)');
    console.log('  [x] 콜 리스트 비우기 (오늘 처음처럼 · 백업 후 삭제)');
    console.log('  [q] 종료');
}
function prompt() { process.stdout.write('선택> '); }

/**
 * 🚦 **리허설 전에 «지금 무엇이 돌고 있는가»를 확인한다** (2026-08-29 신설)
 *
 * 🔴 리허설은 개발 서버(4000)를 쓴다. 그 서버가 **옛 코드로 돌고 있으면 리허설이 통째로
 *    헛일이 된다** — 고친 것을 안 고쳐진 채로 보게 된다. 이 레포가 반복해 오진한 뿌리다
 *    (루트 CLAUDE.md 「무엇이 실제로 돌고 있는가」).
 *
 * 실측 2026-08-29: 감시자(`tsx watch`)는 살아 있는데 **자식이 11시간 27분째** 그대로였다.
 * 그날 아침 고친 «경로 순서»가 안 돌고 있었고, 그대로 리허설했으면 옛 순서를 보고
 * *"안 고쳐졌네"* 로 판단할 뻔했다.
 *
 * → **서버 기동 시각과 소스 최신 수정 시각을 견준다.** 소스가 더 새것이면 깨운다.
 */
async function preflight() {
    const h = await fetch(`${BASE}/api/health`).then(r => r.json()).catch(() => null);
    if (!h) { console.error(`🔴 ${BASE} 응답 없음 — 서버를 먼저 띄우세요 (pnpm dev)`); process.exit(1); }

    // 서버·shared 소스 중 가장 최근에 고친 시각
    const newest = (dir) => {
        let t = 0;
        const walk = (d) => {
            for (const e of readdirSync(d)) {
                if (e === 'node_modules' || e.startsWith('.')) continue;
                const fp = join(d, e);
                const st = statSync(fp);
                if (st.isDirectory()) walk(fp);
                else if (/\.(ts|tsx)$/.test(e)) t = Math.max(t, st.mtimeMs);
            }
        };
        try { walk(dir); } catch { /* 없으면 건너뛴다 */ }
        return t;
    };
    const srcMs = Math.max(newest(join(ROOT, 'server/src')), newest(join(ROOT, 'shared/src')));
    const bootMs = new Date(h.bootedAt).getTime();
    const kst = ms => new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');

    if (srcMs > bootMs) {
        const 뒤처짐 = Math.round((srcMs - bootMs) / 60000);
        console.log(`\n🔴 **서버가 옛 코드로 돌고 있습니다** — 소스가 ${뒤처짐}분 더 새것입니다`);
        console.log(`   서버 기동 ${kst(bootMs)} · 소스 수정 ${kst(srcMs)}`);
        const r = await restartServer({ base: BASE, entry: join(ROOT, 'server/src/index.ts') });
        if (!r.restarted) {
            console.error('\n🔴 재기동을 확인하지 못했습니다 — 이대로 리허설하면 **고친 것이 안 보입니다.**');
            console.error('   서버를 직접 다시 띄운 뒤(pnpm dev) 다시 실행하세요.\n');
            process.exit(1);
        }
    } else {
        console.log(`✅ 서버가 최신 코드입니다 (기동 ${kst(bootMs)})`);
    }

    // 관제웹이 떠 있는지 — 없으면 화면을 못 본다 (리허설의 목적 자체가 화면이다)
    const web = await fetch('http://localhost:3000', { signal: AbortSignal.timeout(2000) })
        .then(r => r.ok).catch(() => false);
    console.log(web
        ? '✅ 관제웹 http://localhost:3000 — 이 주소를 열어 두세요'
        : '⚠️ 관제웹(3000)이 안 떠 있습니다 — `pnpm dev` 가 셋을 다 띄웁니다');
    console.log('');
}

async function main() {
    console.log(`서버 ${BASE} · 기기 ${DEVICE} (앱폰 역할)`);

    // 🧹 오늘 처음처럼 시작 — `pnpm rehearsal --fresh` 는 묻지 않고 바로 비운다
    if (process.argv.includes('--fresh')) {
        await freshStart();
    } else {
        const yn = await ask('오늘 처음처럼 콜 리스트를 비우고 시작할까요? (y/N) ');
        if (yn.trim().toLowerCase() === 'y') await freshStart();
    }

    await preflight();

    setInterval(telemetry, 5000);
    await telemetry();
    menu();
    prompt();

    rl.on('line', async (line) => {
        const c = line.trim().toLowerCase();
        if (c === 'q') { rl.close(); process.exit(0); }
        else if (c === 'x') await freshStart();
        else if (c === 'f') showFilter();
        else if (c === 'c') {
            const pickup = await ask('  상차지 주소: ');
            const dropoff = await ask('  하차지 주소: ');
            const fare = parseInt(await ask('  요금(원): '), 10) || 50000;
            const vehicleType = (await ask('  차종(1t/다마스/라보/오토바이): ')).trim() || '1t';
            await inject({ pickup: pickup.trim(), dropoff: dropoff.trim(), fare, vehicleType });
        }
        else {
            const t = PRESETS.find(p => p.key === c);
            if (t) await inject(t); else if (c) menu();
        }
        prompt();
    });
}
main();
