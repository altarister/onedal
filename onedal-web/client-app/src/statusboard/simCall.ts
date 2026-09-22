/**
 * 🚚 **개별콜 — 현황판에서 시뮬레이터 목록에 콜 한 건을 낸다** (기사님 지시)
 *
 * 기사님: *"시나리오콜, 랜덤콜, 개별콜 이렇게 하면 3가지 종류의 콜을 만들수 있을꺼 같아"*
 *        → *"너는 일단 개별콜 자리를 만들어줘 문제는 나중에 하고"*
 *
 * 🔴 **«🖐️ 콜 생성»(`handmadeCall.ts`)과 다르다** — 그것은 서버 `/api/scrap` 에 바로 넣어 폰 원달앱을 건너뛴다.
 *    개별콜은 서버(`/api/sim/calls`)가 들고 있다가 **시뮬레이터 목록에 띄우고**, 폰 원달앱이 진짜 배차망처럼 읽고·거르고·잡는다.
 * 🔴 칸 이름은 서버 `core/simCallQueue.ts` 의 `SimCallInput` 과 같다 — 서버 검사 `simCallQueue.test.ts` 가 대조한다.
 * 🔴 **동 이름을 지어내지 않는다** (규칙 ④) — 사람이 적은 주소에서 동·읍·면 토막을 읽고, 없으면 내지 않고 다시 적게 한다.
 *    시뮬레이터 목록의 지역 칸(인성)·동 칸(픽커)이 이 이름을 쓰고, 폰 원달앱이 그 글자로 거른다.
 *    ⚠️ 서버 지도의 상위 지명은 표기가 고르지 않아(«서울 영등포구» · «광주시») 거기서 뽑지 않았다.
 */

export interface SimPlaceDraft {
    addressDetail: string;
    region: string;
    lon: number;
    lat: number;
}

export interface SimCallBody {
    pickup: SimPlaceDraft;
    dropoff: SimPlaceDraft;
    fare: number;
}

/** 동·읍·면 토막 — «초월읍» · «삼성2동» · «종로3가». 건물 동(«101동»)은 숫자로 시작해 안 걸린다 */
const REGION_TOKEN = /^[가-힣]+\d*(동|읍|면)$|^[가-힣]+\d+가$/;

/** 주소에서 동·읍·면 — 시·도, 시·군·구 다음부터 찾는다. 도로명만 적은 주소면 null */
export function regionOfAddress(address: string): string | null {
    const tokens = address.trim().split(/\s+/);
    for (let i = 2; i < tokens.length; i++) if (REGION_TOKEN.test(tokens[i])) return tokens[i];
    return null;
}

/** 주소 찾기 결과 → 콜 자리. 동·읍·면이 없으면 무엇을 다시 적을지 말한다 */
export function placeFromFound(found: { address: string; lon: number; lat: number }):
    { ok: true; place: SimPlaceDraft } | { ok: false; why: string } {
    const region = regionOfAddress(found.address);
    if (!region) return { ok: false, why: '동·읍·면이 없는 주소다 — «경기 광주시 초월읍 경충대로 907»처럼 적는다' };
    return { ok: true, place: { addressDetail: found.address.trim(), region, lon: found.lon, lat: found.lat } };
}

/** 요금 칸 → 숫자. 쉼표·빈칸은 떼고, 1 이상의 정수가 아니면 null */
export function fareOf(text: string): number | null {
    const t = text.replace(/[,\s]/g, '');
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return n >= 1 ? n : null;
}

export function simCallBody(pickup: SimPlaceDraft | null, dropoff: SimPlaceDraft | null, fareText: string):
    { ok: true; body: SimCallBody } | { ok: false; why: string } {
    if (!pickup) return { ok: false, why: '상차지를 먼저 찾는다' };
    if (!dropoff) return { ok: false, why: '하차지를 먼저 찾는다' };
    const fare = fareOf(fareText);
    if (fare === null) return { ok: false, why: '요금을 숫자로 적는다' };
    return { ok: true, body: { pickup, dropoff, fare } };
}

/** 시뮬레이터가 이보다 오래 안 물었으면 «꺼져 있나»로 본다 — 시뮬레이터는 «🚚 개별콜»로 시작한 화면에서만 3초마다 묻는다 */
const SIM_POLL_STALE_MS = 10_000;

/** 낸 뒤 한 줄 — 서버가 잰 «시뮬레이터가 마지막으로 물은 뒤»로 시뮬레이터가 켜져 있나를 함께 말한다 */
export function sentNoteOf(seq: number, simPolledAgoMs: number | null): { text: string; ok: boolean } {
    if (simPolledAgoMs === null) {
        return { text: `⚠️ #${seq} 서버가 들고 있다 — 시뮬레이터가 아직 안 물었다 (시뮬레이터를 «🚚 개별콜»로 시작했나)`, ok: false };
    }
    if (simPolledAgoMs > SIM_POLL_STALE_MS) {
        return { text: `⚠️ #${seq} 서버가 들고 있다 — 시뮬레이터가 ${Math.round(simPolledAgoMs / 1000)}초째 안 묻는다 (개별콜 화면을 나갔나)`, ok: false };
    }
    return { text: `✅ #${seq} 서버가 들고 있다 — 시뮬레이터가 3초 안에 목록에 넣는다`, ok: true };
}
