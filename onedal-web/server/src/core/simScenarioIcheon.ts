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
const LOTTE_OUTLET   = place('롯데아울렛 이천', '호법면', '경기 이천시 호법면 프리미엄아울렛로 177-74 롯데프리미엄아울렛 이천점', 127.40048, 37.24236);

export const ICHEON_ROUND_TRIP: ScenarioRow[] = [
    /* ── A 집 — 모의 주행 멈춤 · 콜 0건 ── */
    { id: 'A1', stage: 'A', when: { after: 'prev' }, kind: 'block', blockBy: 'pickup',
      call: { pickup: ICHEON_TERMINAL, dropoff: SINDUN_NH, fare: 30000, vehicleType: '다마스' },
      say: '⚪ 안 올라와야 맞다 — 기다리기만', why: '첫짐이면 상차 반경이 돈다 — 집에서 17.4km > 4.55km' },
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
      say: '🧭 현황판 🎭 모의 주행 ▶ 시작 (🚗 보통 · 정차 30초)', why: '주행이 감지되면 출발이 켜진다 — 내 영역이 빠진다',
      done: { kind: 'phase', value: 'DELIVERING' }, checks: [{ kind: 'listLacks', value: ['매산동'] }] },

    /* ── B 가는 길 ── */
    { id: 'B1', stage: 'B', when: { arrive: 'A2', stop: 'pickup' }, kind: 'keep',
      call: { pickup: GONJIAM_CHURCH, dropoff: ICHEON_JEIL, fare: 50000, vehicleType: '다마스' },
      say: '🟢 올라오면 관제웹에서 KEEP — 심사석 결론 줄·지도 강조를 본다', why: '가는 길 합짐 — 합짐이라 상차 반경 안 본다' },
    { id: 'B2', stage: 'B', when: { arrive: 'B1', stop: 'pickup' }, kind: 'block', blockBy: 'region',
      call: { pickup: ICHEON_TERMINAL, dropoff: MODA, fare: 50000, vehicleType: '다마스' },
      say: '⚪ 안 올라와야 맞다 — 기다리기만', why: '초월읍은 지나와서 목록에서 빠졌다',
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
    { id: 'C3', stage: 'C', when: { after: 'prev' }, kind: 'keep',
      call: { pickup: HD_SINDUN, dropoff: CHOWOL_STATION, fare: 50000, vehicleType: '다마스' },
      say: '🟢 올라오면 관제웹에서 KEEP — 복귀콜', why: '확정하면 목적지가 집 하나 — 🎯 하나 · 마름모 하나',
      checks: [{ kind: 'goals', value: 1 }] },

    /* ── D 복귀 — 복귀콜 확정 뒤 ── */
    /* 🔴 요금을 C2 와 다르게 둔다 — 폰은 «상차 동 + 하차 동 + 요금» 지문으로 본 콜을 다시 판정하지 않는다 (`CallMemory` · #128 뒤 01:39 실측) */
    { id: 'D1', stage: 'D', when: { arrive: 'B3', stop: 'dropoff' }, kind: 'block', blockBy: 'region', guess: true,
      call: { pickup: ICHEON_TERMINAL, dropoff: ICHEON_JEIL, fare: 31000, vehicleType: '승용차' },
      say: '⚪ 안 올라와야 맞다 — C2 와 같은 구간', why: '목적지 원이 빠졌고 관고동은 지나왔다 (추정) · 요금만 C2 와 다르다(폰 지문)' },
    { id: 'D2', stage: 'D', when: { after: 'prev' }, kind: 'block', blockBy: 'region',
      call: { pickup: ICHEON_TERMINAL, dropoff: LOTTE_OUTLET, fare: 50000, vehicleType: '승용차' },
      say: '⚪ 안 올라와야 맞다 — 기다리기만', why: '호법면은 어느 목록에도 없다' },
    { id: 'D3', stage: 'D', when: { arrive: 'C3', stop: 'pickup' }, kind: 'keep', guess: true,
      call: { pickup: WOORI_OIL, dropoff: GONJIAM_STAR, fare: 30000, vehicleType: '승용차' },
      say: '🟢 올라오면 관제웹에서 KEEP — 오는 길 합짐', why: '곤지암읍은 집 가는 경로 띠에 걸친다 (추정)' },
    { id: 'D4', stage: 'D', when: { arrive: 'D3', stop: 'pickup' }, kind: 'block', blockBy: 'routeOrder', guess: true,
      call: { pickup: MAJANG_OIL, dropoff: CHOWOL_STATION, fare: 30000, vehicleType: '승용차' },
      say: '⚪ 안 올라와야 맞다 — 기다리기만', why: '마장면은 지나온 뒤쪽이다 — 경로 밖 상차 (추정)' },

    /* ── E 끝 ── */
    { id: 'E1', stage: 'E', when: { after: 'prev' }, kind: 'act',
      say: '🧭 끝까지 달리게 둔다 — 초월역 · 곤지암스타 하차', why: '복귀콜이 있었으니 끝나면 복귀가 저절로 꺼진다',
      done: { kind: 'phase', value: 'STANDBY' }, checks: [{ kind: 'target', value: 'DEST' }] },
];
