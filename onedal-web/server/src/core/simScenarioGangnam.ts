import type { ScenarioPlace, ScenarioRow } from './simScenario';

/**
 * 🎬 **강남 진입과 광주 복귀 5콜 — 실전 판정 및 버그 종합 검증 문제지**
 * (기사님 지시 · «복정→대치 첫짐 똥콜 버그» 및 «광주 초월읍 지오코딩/수락 버그» 검증)
 *
 * ── 스토리 ──
 * 1. 복정에서 대치4동으로 올라가는 첫짐 (12,000원): 목적지(강남구) 전진 배수 ×1.95 곱해져 86점 꿀콜!
 * 2. 가는 길 송파(문정동)에서 양재동 가는 길목 합짐 (25,000원): 우회시급 4.2만/h → 78점 꿀콜!
 * 3. 짐 다 내리고 역삼동에서 가락동 시내 연결 (20,000원): 만석 없이 적재량 초기화 정상 동작!
 * 4. 가락동 하차 후 ↩️ 복귀 켬! 장지동에서 분당 야탑동 가는 복귀 첫 콜 (30,000원): 75점 꿀콜!
 * 5. 야탑 옆 이매동에서 광주 초월읍(집)으로 직행하는 복귀 합짐 (40,000원):
 *    «광주 초월읍»을 카카오 지오코딩이 '경기'로 정확히 식별하고 수락 후 정상 종료!
 *
 * 🔴 시험에서 실제로 걸어 보는 번호라 기사님 번호다 — 남의 번호를 적으면 오배차가 된다.
 */
const SCENARIO_PHONE = '010-5246-9062';

const place = (name: string, region: string, addressDetail: string, lon: number, lat: number, phone1 = SCENARIO_PHONE): ScenarioPlace =>
    ({ name, region, addressDetail, lon, lat, phone1 });

const BOKJEONG_STATION = place('복정역', '복정동', '경기 성남시 수정구 복정동 610-1 복정역', 127.126334, 37.452198);
const DAECHI_EUNMA     = place('대치은마', '대치동', '서울 강남구 대치동 316 은마아파트', 127.065444, 37.497540);
const MUNJEONG_RODEO   = place('문정로데오', '문정동', '서울 송파구 문정동 29-23 문정로데오거리', 127.123889, 37.489958);
const YANGJAE_AT       = place('양재aT', '양재동', '서울 서초구 양재동 232 aT센터', 127.039227, 37.468305);
const YEOKSAM_STATION  = place('역삼역', '역삼동', '서울 강남구 역삼동 737 역삼역', 127.036629, 37.499810);
const GARAK_MARKET     = place('가락시장', '가락동', '서울 송파구 가락동 600 가락시장', 127.111298, 37.493425);
const JANGJI_GARDEN    = place('장지가든파이브', '장지동', '서울 송파구 장지동 676 가든파이브', 127.123739, 37.473440);
const YATAP_TERMINAL   = place('야탑터미널', '야탑동', '경기 성남시 분당구 야탑동 341 성남종합버스터미널', 127.127326, 37.413095);
const IMAE_STATION     = place('이매역', '이매동', '경기 성남시 분당구 이매동 127-1 이매역', 127.127977, 37.403736);
const CHOWOL_STATION   = place('초월역', '초월읍', '경기 광주시 초월읍 경충대로 1066 초월역', 127.299992, 37.373355);

export const GANGNAM_FIVE_OK: ScenarioRow[] = [
    /* ── A 단계: 강남 진입 첫짐 ── */
    {
        id: 'G1', stage: 'A', when: { after: 'prev' }, kind: 'keep',
        call: { pickup: BOKJEONG_STATION, dropoff: DAECHI_EUNMA, fare: 12000, vehicleType: '다마스' },
        say: '🟢 올라오면 관제웹에서 KEEP — 04:54 복정→대치 첫짐 (목적지 전진율 86점 꿀콜)',
        why: '새 전진율 배수(×1.95) 곱셈 검증 — 예전 36점 똥콜이 86점 꿀콜로 살아남',
        checks: [{ kind: 'phase', value: 'GATHERING' }],
    },
    {
        id: 'M1', stage: 'A', when: { after: 'prev' }, kind: 'act',
        say: '🧭 현황판 🎭 모의 주행 ▶ 시작 (🚗 보통 3배 · 정차 12초)',
        why: '주행이 감지되면 출발이 켜진다',
        done: { kind: 'phase', value: 'DELIVERING' },
    },

    /* ── B 단계: 강남 가는 길목 합짐 ── */
    {
        id: 'G2', stage: 'B', when: { arrive: 'G1', stop: 'pickup' }, kind: 'keep',
        call: { pickup: MUNJEONG_RODEO, dropoff: YANGJAE_AT, fare: 25000, vehicleType: '다마스' },
        say: '🟢 올라오면 관제웹에서 KEEP — 송파→양재 가는 길 합짐 (78점 꿀콜)',
        why: '합짐 2점 꺾은선 검증 — 우회시급 4.2만/h로 78점 꿀콜 판정',
    },

    /* ── C 단계: 서울 시내 이동 (짐을 다 내린 후 적재량 리셋 검증) ── */
    {
        id: 'G3', stage: 'C', when: { arrive: 'G2', stop: 'dropoff' }, kind: 'keep',
        call: { pickup: YEOKSAM_STATION, dropoff: GARAK_MARKET, fare: 20000, vehicleType: '승용차' },
        say: '🟢 올라오면 관제웹에서 KEEP — 강남 시내 이동 (적재 부하 초기화 검증)',
        why: 'peakLoadPoints 검증 — 앞선 짐들을 다 내렸으므로 만석 에러 없이 정상 수락',
    },

    /* ── D 단계: 복귀 모드 전환 및 복귀 첫 콜 ── */
    {
        id: 'C1', stage: 'D', when: { arrive: 'G3', stop: 'dropoff' }, kind: 'act',
        say: '🧭 관제웹 🔍 필터 ↩️ 복귀 켬',
        why: '서울 배송을 마쳤다 — 목적지를 경기 광주(집)로 전환한다',
        done: { kind: 'target', value: 'HOME' },
    },
    {
        id: 'G4', stage: 'D', when: { after: 'prev' }, kind: 'keep',
        call: { pickup: JANGJI_GARDEN, dropoff: YATAP_TERMINAL, fare: 30000, vehicleType: '다마스' },
        say: '🟢 올라오면 관제웹에서 KEEP — 송파→분당 복귀 1 (75점 꿀콜)',
        why: '복귀 국면 판정 검증 — 남쪽 복귀 라인에 정상 매칭되어 75점 꿀콜',
    },

    /* ── E 단계: 경기 광주 집으로 들어가는 복귀 합짐 피날레 ── */
    {
        id: 'G5', stage: 'E', when: { arrive: 'G4', stop: 'pickup' }, kind: 'keep',
        call: { pickup: IMAE_STATION, dropoff: CHOWOL_STATION, fare: 40000, vehicleType: '다마스' },
        say: '🟢 올라오면 관제웹에서 KEEP — 분당→광주초월 복귀 피날레 (90점 꿀콜)',
        why: '버그 #162 최종 검증 — «광주 초월읍»을 전남 광주가 아닌 경기로 정확히 판별하여 지오코딩 성공 및 수락',
    },

    /* ── 종료 단계 ── */
    {
        id: 'F1', stage: 'E', when: { after: 'prev' }, kind: 'act',
        say: '🧭 초월역(집)에 서면 관제웹에서 하차 완료 — 5콜 완주 성공!',
        why: '집 가까이 도착했으므로 복귀가 저절로 꺼지고 STANDBY로 복귀한다',
        done: { kind: 'phase', value: 'STANDBY' },
    },
];
