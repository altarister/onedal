/**
 * 콜 한 건의 짐
 * 누가: 콜 모양 · 서버 판정 · 합짐 자리 · 관제웹 짐 표시
 * 언제: 배차망 화면의 차종 · 크기 · 물품 글자를 담거나, 거기서 우리 차종 · 라면박스 수를 꺼낼 때
 * 어디서: 콜 한 건의 짐 묶음과 배차망 정의 표의 차종 낱말 · 크기 낱말 · 사실 칸
 * 무엇을: LOAD_KINDS · CallLoad · loadFrom · carriedLoad · VEHICLE_MATCH_KINDS · VehicleMatch · vehicleMatchOf · sizeBoxesOf · boxesOf
 * 어떻게: 짐 묶음에는 화면 글자만 담고, 우리 차종 맞춤 · 박스 수는 정의 표를 읽는 함수로 꺼낸다
 * 왜: 네 배차망의 짐 글자를 한 모양으로 담고, 차종 거르기 · 단가 · 합짐 자리가 같은 답을 보게 하기 위해서다
 */
/* 🚚 vehicles · networkPages 의 값을 가져온다 — 둘 다 이 파일을 가져오지 않아 순환이 없다 */
import type { VehicleType } from './vehicles';
import { VEHICLE_CAPACITY, normalizeVehicleType } from './vehicles';
import type { TargetAppType } from '../network/targetApps';
import { NETWORK_PAGES } from '../network/networkPages';

/* 짐 줄 갈래 — 목록이 원천, 타입은 파생 */
export const LOAD_KINDS = ['weight', 'dimension', 'body', 'passenger', 'goods', 'care', 'unknown'] as const;
export type LoadKind = typeof LOAD_KINDS[number];
export const LOAD_KIND_LABEL: Record<LoadKind, string> = {
    weight: '무게', dimension: '치수', body: '몸 모양', passenger: '동승', goods: '품목', care: '취급 주의', unknown: '뜻 모름',
};

/** 화면에 적힌 짐 한 줄 — 글자 그대로. 숫자로 바꾸지 않는다 */
export interface LoadLine {
    kind: LoadKind;
    shown: string;              // «3.85톤» · «세 변의 합 100cm» · «2분동승» · «전자제품이에요»
}

/** 콜 한 건의 짐 — 모든 앱이 이 모양 하나를 읽는다 */
export interface CallLoad {
    vehicleText: string | null; // 화면 차종 글자 «3.5톤/윙» · «다» · «승» — 없으면 null
    sizeText: string | null;    // 크기 낱말 «소형» · «다마» — 없으면 null
    itemText: string | null;    // 물품 글 통째 «중형 세 변의 합 140cm · 20kg 이하»
    lines: LoadLine[];          // 무게 · 치수 · 몸 모양 · 동승 · 품목 · 취급 주의
}

const textOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** 콜 한 칸(orders.callShape)을 푼 load 덩어리 → 짐 묶음 · 객체가 아니면 null · 글자 칸은 글자일 때만 · 모르는 갈래 · 글자 아닌 shown 줄은 담지 않는다 */
export function loadFrom(raw: unknown): CallLoad | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const lines = (Array.isArray(o.lines) ? o.lines : []).flatMap((l): LoadLine[] => {
        if (!l || typeof l !== 'object') return [];
        const { kind, shown } = l as Record<string, unknown>;
        return typeof kind === 'string' && (LOAD_KINDS as readonly string[]).includes(kind) && typeof shown === 'string'
            ? [{ kind: kind as LoadKind, shown }] : [];
    });
    return { vehicleText: textOrNull(o.vehicleText), sizeText: textOrNull(o.sizeText), itemText: textOrNull(o.itemText), lines };
}

/**
 * 📦 **짐 묶음을 칸마다 잇는다** — 앞에 놓인 묶음이 먼저 · 그 칸이 비면(null · 짐 줄 빈 목록) 다음 묶음의 칸.
 *    서버 `/detail` 이 «상세 짐 → 원달앱 보고 짐 → 앞 기억» 차례로 넘긴다 — 상세에 크기 낱말이 없다고 보고의 크기 낱말이 지워지지 않게.
 *    묶음이 하나도 없으면 null.
 */
export function carriedLoad(...loads: Array<CallLoad | null | undefined>): CallLoad | null {
    const present = loads.filter((l): l is CallLoad => !!l);
    if (!present.length) return null;
    const first = <K extends 'vehicleText' | 'sizeText' | 'itemText'>(k: K) => present.find(l => l[k] != null)?.[k] ?? null;
    return { vehicleText: first('vehicleText'), sizeText: first('sizeText'), itemText: first('itemText'), lines: present.find(l => l.lines?.length)?.lines ?? [] };
}

/* 차종 맞춤 넷 — 저장하지 않고 꺼낸다 · 수단 상관없음(ANY)은 허용 차종을 지나고, 우리 차종에 없음(NONE)은 못 싣는 콜이다 */
export const VEHICLE_MATCH_KINDS = ['OURS', 'ANY', 'NONE', 'UNKNOWN'] as const;
export type VehicleMatchKind = typeof VEHICLE_MATCH_KINDS[number];
export const VEHICLE_MATCH_LABEL: Record<VehicleMatchKind, string> = {
    OURS: '우리 차종', ANY: '수단 상관없음', NONE: '우리 차종에 없음', UNKNOWN: '모름',
};
export type VehicleMatch =
    | { kind: 'OURS'; vehicle: VehicleType }
    | { kind: Exclude<VehicleMatchKind, 'OURS'> };

/**
 * 정의 표의 차종 낱말 · 사실 칸으로 맞춘다 — 배차망 이름으로 가르지 않는다.
 * 차종 글자가 없으면 그 배차망의 «차종 글자가 없으면 수단 상관없음» 칸이 참일 때만 수단 상관없음, 아니면 모름이다.
 * 우리 차종은 `normalizeVehicleType` 의 답이고, 그 배차망 표에 «우리 차종 없음»으로 적힌 낱말(인성 «14t»)은 우리 차종에 없음이다.
 */
export function vehicleMatchOf(load: CallLoad, network: TargetAppType): VehicleMatch {
    const spec = NETWORK_PAGES[network];
    const text = load.vehicleText?.trim();
    if (!text) return { kind: spec.vehicleAbsentMeansAny ? 'ANY' : 'UNKNOWN' };
    const vehicle = normalizeVehicleType(text);
    if (vehicle) return { kind: 'OURS', vehicle };
    if ((spec.vehicleWords ?? []).some(w => w.word === text && w.vehicle === null)) return { kind: 'NONE' };
    return { kind: 'UNKNOWN' };
}

/** 크기 낱말의 라면박스 수 — 그 배차망 정의 표 sizeWords 에 박스 수가 적힌 낱말만 · 낱말이 없거나 박스 모름(«대형» · «다마»)이면 null */
export function sizeBoxesOf(load: Pick<CallLoad, 'sizeText'>, network: TargetAppType): number | null {
    return NETWORK_PAGES[network].sizeWords?.find(w => w.word === load.sizeText)?.boxes ?? null;
}

/**
 * 라면박스 수 — 크기 낱말(정의 표 sizeWords) > 콜 차종 표준(VEHICLE_CAPACITY). 모르면 null.
 * 크기 낱말이 표에 있어도 박스 수가 모름(«대형»)이면 콜 차종 표준으로 넘어간다.
 */
export function boxesOf(load: CallLoad, network: TargetAppType): number | null {
    const size = sizeBoxesOf(load, network);
    if (size != null) return size;
    const match = vehicleMatchOf(load, network);
    return match.kind === 'OURS' ? VEHICLE_CAPACITY[match.vehicle] : null;
}
