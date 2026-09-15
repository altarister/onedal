import type { ScenarioPlace, ScenarioRow } from './simScenario';

/**
 * 🎬 **이천 왕복 하루 — 줄 데이터** (기사님 지시 2026-09-15 · 설계서 `docs/기획/문제지_이천왕복.md` §3 · §7-5).
 *
 * 🔴 **줄은 여기 한 곳이다** — 설계서 표와 이 파일이 두 벌이 되면 한쪽만 고쳐진다. 설계서를 고치면 여기도 고친다.
 * 🔴 **`region` 은 폰이 보는 동 이름이다** — 시뮬레이터 목록의 지역 칸이 이 글자를 쓰고 원달앱이 그 글자로 거른다.
 *    좌표에서 뽑지 않는다 (롯데아울렛은 좌표로는 마장면 쪽이지만 주소가 «호법면»이다).
 * 좌표는 카카오 장소검색 실값이다 (`onedal-sim/packages/core-simulator/src/presets.ts` 의 같은 지점).
 */

const place = (name: string, region: string, addressDetail: string, lon: number, lat: number): ScenarioPlace =>
    ({ name, region, addressDetail, lon, lat });

const CHOWOL_STATION = place('초월역', '초월읍', '경기 광주시 초월읍 경충대로 1066 초월역', 127.299905, 37.373379);
const MODA           = place('모다아울렛', '초월읍', '경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점', 127.312587, 37.363298);
const GONJIAM_CHURCH = place('곤지암성당', '곤지암읍', '경기 광주시 곤지암읍 경충대로543번길 19 곤지암성당', 127.348642, 37.346213);
const SINDUN_NH      = place('신둔농협 예스파크', '신둔면', '경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점', 127.401207, 37.309733);
const IJO_GALBI      = place('이조갈비', '사음동', '경기 이천시 사음동 452-4 이조갈비함흥냉면', 127.416293, 37.294522);
const ICHEON_JEIL    = place('이천제일', '관고동', '경기 이천시 관고동 107-5 이천제일식자재마트', 127.429230, 37.285068);
const ICHEON_TERMINAL = place('이천터미널', '중리동', '경기 이천시 중리동 219-1 이천터미널', 127.446936, 37.277421);
const HD_SINDUN      = place('HD현대 신둔', '신둔면', '경기 이천시 신둔면 경충대로 3126 HD현대오일뱅크직영 신둔주유소', 127.40410, 37.30574);
const WOORI_OIL      = place('우리주유소', '신둔면', '경기 이천시 신둔면 경충대로 3282 우리주유소', 127.39719, 37.31740);
const GONJIAM_STAR   = place('곤지암스타주유소', '곤지암읍', '경기 광주시 곤지암읍 경충대로 698 곤지암스타주유소', 127.33209, 37.35310);
const MAJANG_OIL     = place('마장주유소', '마장면', '경기 이천시 마장면 서이천로 564 마장주유소', 127.40176, 37.27208);
const EMART_GWANGJU  = place('이마트 광주점', '경안동', '경기 광주시 경안동 493-4 이마트 광주점', 127.258213, 37.410390);
const LOTTE_OUTLET   = place('롯데아울렛 이천', '호법면', '경기 이천시 호법면 프리미엄아울렛로 177-74 롯데프리미엄아울렛 이천점', 127.40048, 37.24236);

export const ICHEON_ROUND_TRIP: ScenarioRow[] = [
    /* ── A 집 — 모의 주행 멈춤 · 콜 0건 ── */
    { id: 'A1', stage: 'A', when: { after: 'prev' }, kind: 'block', blockBy: 'pickupList',
      call: { pickup: EMART_GWANGJU, dropoff: SINDUN_NH, fare: 30000, vehicleType: '다마스' },
      say: '⚪ 안 올라와야 맞다 — 기다리기만', why: '콜 전 상차 목록 = 현위치 반경뿐 — 경안동은 뒤쪽 7km(반경 밖) (#134 · 2026-09-15 개정)' },
    { id: 'A2', stage: 'A', when: { after: 'prev' }, kind: 'keep',
      call: { pickup: MODA, dropoff: SINDUN_NH, fare: 50000, vehicleType: '다마스' },
      say: '🟢 올라오면 관제웹에서 KEEP', why: '정상 첫짐 — 확정 뒤에도 집 뒤 동(내 영역)이 남아야 한다',
      checks: [{ kind: 'phase', value: 'GATHERING' }, { kind: 'listHas', value: ['매산동', '쌍령동', '양벌동'] }] },
    { id: 'A3', stage: 'A', when: { after: 'prev' }, kind: 'block', blockBy: 'fare',
      call: { pickup: GONJIAM_CHURCH, dropoff: ICHEON_JEIL, fare: 5000, vehicleType: '다마스' },
      say: '⚪ 안 올라와야 맞다 — 기다리기만', why: '9.8km × 616원 = 6,036원 하한 · 확정 뒤라 상차 반경은 안 본다' },
    { id: 'A4', stage: 'A', when: { after: 'prev' }, kind: 'block', blockBy: 'vehicle',
      call: { pickup: MODA, dropoff: ICHEON_TERMINAL, fare: 150000, vehicleType: '5t' },
      say: '⚪ 안 올라와야 맞다 — 기다리기만', why: '5t 는 허용 차종 밖' },
    { id: 'M1', stage: 'A', when: { after: 'prev' }, kind: 'act',
      say: '🧭 현황판 🎭 모의 주행 ▶ 시작 (🚗 보통 3배 · 정차 12초 — 눈금이 다르면 ↩︎ 기본으로)', why: '주행이 감지되면 출발이 켜진다 — 내 영역이 빠진다',
      done: { kind: 'phase', value: 'DELIVERING' }, checks: [{ kind: 'listLacks', value: ['매산동'] }] },

    /* ── B 가는 길 ── */
    { id: 'B1', stage: 'B', when: { arrive: 'A2', stop: 'pickup' }, kind: 'keep',
      call: { pickup: GONJIAM_CHURCH, dropoff: ICHEON_JEIL, fare: 50000, vehicleType: '다마스' },
      say: '🟢 올라오면 관제웹에서 KEEP — 심사석 결론 줄·지도 강조를 본다', why: '가는 길 합짐 — 합짐이라 상차 반경 안 본다' },
    { id: 'B2', stage: 'B', when: { arrive: 'B1', stop: 'pickup' }, kind: 'block', blockBy: 'pickupList',
      call: { pickup: ICHEON_TERMINAL, dropoff: MODA, fare: 50000, vehicleType: '다마스' },
      say: '⚪ 안 올라와야 맞다 — 기다리기만', why: '곤지암에서 이천터미널(중리동) 상차는 현위치 원 ∩ 라인 밖 (#134) · 초월읍도 지나와서 하차 목록에서 빠졌다',
      checks: [{ kind: 'listLacks', value: ['초월읍'] }] },
    { id: 'B3', stage: 'B', when: { arrive: 'A2', stop: 'dropoff' }, kind: 'keep',
      call: { pickup: IJO_GALBI, dropoff: ICHEON_TERMINAL, fare: 50000, vehicleType: '다마스' },
      say: '🟢 올라오면 관제웹에서 KEEP — 심사석 «근거 ▾» 기존 콜 줄을 본다', why: '사음동·중리동 목록 안 · 적재 90/100' },

    /* ── C 이천 — 복귀 대기 ── */
    { id: 'C1', stage: 'C', when: { arrive: 'B3', stop: 'pickup' }, kind: 'act',
      say: '🧭 관제웹 🔍 필터 ↩️ 복귀 켬', why: '목적지가 둘이 된다 — 🎯 둘 · 마름모 둘',
      done: { kind: 'target', value: 'HOME' }, checks: [{ kind: 'goals', value: 2 }] },
    { id: 'C2', stage: 'C', when: { arrive: 'B1', stop: 'dropoff' }, kind: 'cancel',
      call: { pickup: ICHEON_TERMINAL, dropoff: ICHEON_JEIL, fare: 30000, vehicleType: '승용차' },
      say: '🟡 올라오면 관제웹에서 ❌ 취소 (올라오는지만 본다)', why: '복귀 대기엔 이천 목적지가 살아 있다 — D1 과 대조' },
    /* 🔄 C3 는 B3 하차(이천터미널)에 선 뒤 — 이천 일을 다 내리고 복귀콜을 받는다. B3 확정 직후에 내면 차는 동쪽(사음동·중리동)으로 가는데
       상차가 서쪽 신둔이라 뒤로 가기가 된다 (여섯 번째 바퀴 · 기사님 «다 와 가는데 초월 콜을 받았으니 뒤로 가기» · onedal-49: 터미널→신둔면 경계 2.79km, 원 4.6km 안) */
    { id: 'C3', stage: 'C', when: { arrive: 'B3', stop: 'dropoff' }, kind: 'keep',
      call: { pickup: HD_SINDUN, dropoff: CHOWOL_STATION, fare: 50000, vehicleType: '다마스' },
      say: '🟢 올라오면 관제웹에서 KEEP — 복귀콜', why: '확정하면 목적지가 집 하나 — 🎯 하나 · 마름모 하나',
      checks: [{ kind: 'goals', value: 1 }] },

    /* ── D 복귀 — 복귀콜 확정 뒤 ── */
    /* 🔴 요금을 C2 와 다르게 둔다 — 폰은 «상차 동 + 하차 동 + 요금» 지문으로 본 콜을 다시 판정하지 않는다 (`CallMemory` · #128 뒤 01:39 실측) */
    /* 🔄 D1 은 «막힘»이다 — 복귀콜(C3)을 쥐면 하차 목록이 집이라 관고동이 빠진다 (일곱 번째 바퀴 intel region · onedal-49 합의 · 옛 «올라오면 취소(추정)»은 틀렸다) */
    { id: 'D1', stage: 'D', when: { arrive: 'B3', stop: 'dropoff' }, kind: 'block', blockBy: 'region',
      call: { pickup: ICHEON_TERMINAL, dropoff: ICHEON_JEIL, fare: 31000, vehicleType: '승용차' },
      say: '⚪ 안 올라와야 맞다 — 기다리기만', why: '복귀콜을 쥐었으니 하차 목록 = 집 — 관고동(이천)은 목록 밖 · 요금만 C2 와 다르다(폰 지문)' },
    { id: 'D2', stage: 'D', when: { after: 'prev' }, kind: 'block', blockBy: 'region',
      call: { pickup: ICHEON_TERMINAL, dropoff: LOTTE_OUTLET, fare: 50000, vehicleType: '승용차' },
      say: '⚪ 안 올라와야 맞다 — 기다리기만', why: '호법면은 어느 목록에도 없다' },
    { id: 'D3', stage: 'D', when: { arrive: 'C3', stop: 'pickup' }, kind: 'keep', guess: true,
      call: { pickup: WOORI_OIL, dropoff: GONJIAM_STAR, fare: 30000, vehicleType: '승용차' },
      say: '🟢 올라오면 관제웹에서 KEEP — 오는 길 합짐', why: '곤지암읍은 집 가는 경로 띠에 걸친다 (추정)' },
    { id: 'D4', stage: 'D', when: { arrive: 'D3', stop: 'pickup' }, kind: 'block', blockBy: 'pickupList',
      call: { pickup: MAJANG_OIL, dropoff: CHOWOL_STATION, fare: 30000, vehicleType: '승용차' },
      say: '⚪ 안 올라와야 맞다 — 기다리기만', why: '복귀콜을 쥐었으니 상차 목록 = 현위치 원 ∩ 라인 띠 — 마장면은 집 가는 라인 밖 (#134 · 실제 지도 검사)' },

    /* ── E 끝 ── */
    { id: 'E1', stage: 'E', when: { after: 'prev' }, kind: 'act',
      say: '🧭 마지막 하차지에 서면 관제웹에서 하차 완료 — 초월역 · 곤지암스타', why: '모의 주행은 콜이 없으면 그 자리에서 대기한다(떠나야 저절로 찍힌다) · 복귀콜을 집 가까이 내렸으니 복귀가 저절로 꺼진다',
      done: { kind: 'phase', value: 'STANDBY' }, checks: [{ kind: 'target', value: 'DEST' }] },
];

/**
 * 🎬 **이천 성공하는 5콜 — 빨리 도는 문제** (기사님 지시 2026-09-15 · 설계서 `docs/기획/문제지_이천왕복.md` §8).
 *
 * 기사님: *"빠른시간에 잘되는 콜들로 빨리 빨리 테스트 하고 싶어 — 성공하는 콜들로 이루어진 5개 짜리 문제 ·
 * 2개는 갈때 1개는 복귀클릭하고 복귀콜이 잡히기전에 나머지는 복귀 콜로"*.
 * 🔴 **막힘·취소 줄이 없다** — 콜 다섯은 전부 KEEP. 경로는 위 «이천 왕복 하루»에서 **실제로 KEEP 까지 간 것**만 쓴다
 *    (2026-09-15 13:04 바퀴 · A2 · B1 · B3 · C3 · D3 ✅). 적재는 한 번에 최대 60박스(다마스 둘)라 1t 에 든다.
 */
export const ICHEON_FIVE_OK: ScenarioRow[] = [
    /* ── 가는 길 둘 ── */
    { id: 'S1', stage: 'A', when: { after: 'prev' }, kind: 'keep',
      call: { pickup: MODA, dropoff: SINDUN_NH, fare: 50000, vehicleType: '다마스' },
      say: '🟢 올라오면 관제웹에서 KEEP — 가는 길 1', why: '첫짐 — 이천 왕복 A2 와 같은 콜 (✅ 13:04)' },
    { id: 'M1', stage: 'A', when: { after: 'prev' }, kind: 'act',
      say: '🧭 현황판 🎭 모의 주행 ▶ 시작 (🚗 보통 3배 · 정차 12초 — 눈금이 다르면 ↩︎ 기본으로)', why: '주행이 감지되면 출발이 켜진다',
      done: { kind: 'phase', value: 'DELIVERING' } },
    { id: 'S2', stage: 'B', when: { arrive: 'S1', stop: 'pickup' }, kind: 'keep',
      call: { pickup: GONJIAM_CHURCH, dropoff: ICHEON_JEIL, fare: 50000, vehicleType: '다마스' },
      say: '🟢 올라오면 관제웹에서 KEEP — 가는 길 2', why: '가는 길 합짐 — 이천 왕복 B1 과 같은 콜 (✅ 13:05)' },

    /* ── 이천 — 복귀 켜고, 복귀콜 전에 이천 안 콜 하나 ── */
    { id: 'C1', stage: 'C', when: { arrive: 'S2', stop: 'dropoff' }, kind: 'act',
      say: '🧭 관제웹 🔍 필터 ↩️ 복귀 켬', why: '이천 일을 다 내렸다 — 복귀 대기엔 이천 목적지가 아직 살아 있다',
      done: { kind: 'target', value: 'HOME' } },
    { id: 'S3', stage: 'C', when: { after: 'prev' }, kind: 'keep', guess: true,
      call: { pickup: IJO_GALBI, dropoff: ICHEON_TERMINAL, fare: 50000, vehicleType: '다마스' },
      say: '🟢 올라오면 관제웹에서 KEEP — 복귀콜 전 이천 안 콜', why: '이천 왕복 B3 와 같은 경로 (✅ 13:07) — 복귀를 켠 뒤에 내는 것은 처음이라 추정 · 사음동은 내 위치(관고동) 반경 안' },

    /* ── 복귀콜 둘 ── */
    { id: 'S4', stage: 'D', when: { arrive: 'S3', stop: 'pickup' }, kind: 'keep',
      call: { pickup: HD_SINDUN, dropoff: CHOWOL_STATION, fare: 50000, vehicleType: '다마스' },
      say: '🟢 올라오면 관제웹에서 KEEP — 복귀콜 1', why: '이천 왕복 C3 와 같은 콜 — 사음동에서 신둔 상차 1.7km (이천터미널에서는 4.9km 라 상차 반경 밖)' },
    { id: 'S5', stage: 'D', when: { arrive: 'S4', stop: 'pickup' }, kind: 'keep',
      call: { pickup: WOORI_OIL, dropoff: GONJIAM_STAR, fare: 30000, vehicleType: '승용차' },
      say: '🟢 올라오면 관제웹에서 KEEP — 복귀콜 2 (오는 길 합짐)', why: '이천 왕복 D3 와 같은 콜 (✅ 13:11)' },

    /* ── 끝 ── */
    { id: 'E1', stage: 'E', when: { after: 'prev' }, kind: 'act',
      say: '🧭 마지막 하차지에 서면 관제웹에서 하차 완료 — 초월역 · 곤지암스타', why: '모의 주행은 콜이 없으면 그 자리에서 대기한다(떠나야 저절로 찍힌다)',
      done: { kind: 'phase', value: 'STANDBY' } },
];
