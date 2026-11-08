import { stopQueryOf, DEFAULT_TARGET_APP, type CallStop, type TargetAppType } from '@onedal/shared';

/* 📏 두 지점 거리는 shared haversineKm 하나(공통 함수 3) */

export function getMinuteDiff(start?: string, end?: string) {
    if (!start || !end || start === '?' || end === '?') return null;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 1440;
    return diff;
}

/**
 * 🏷️ **주소 → 짧은 이름** — ① 둘째 낱말부터 동 · 읍 · 면 · 숫자+가(«종로3가») ② 없으면 첫 낱말이 읍 · 면일 때 그 낱말(«화도읍 폭포로412-18» — 도로명보다 읍)
 *    ③ 둘째 낱말부터 구 ④ 둘째 낱말. 빈 글자는 «배차값없음» · 한 낱말은 그대로.
 *    첫 낱말의 동 · 끝말 «리»는 안 본다 — 첫 낱말은 구 줄임(«성동» · «강동» · «남동») · 시 이름(«구리»)이 많고, «리»는 상호 끝(«디아스토리»)에 걸린다.
 */
export function getAddressLabel(addr: string) {
    if (!addr) return "배차값없음";
    const parts = addr.split(' ');
    if (parts.length <= 1) return addr;

    const dong = parts.find((p, idx) => idx >= 1 && (p.match(/[동읍면]$/) || p.match(/\d+가$/)));
    if (dong) return dong;

    if (/[읍면]$/.test(parts[0])) return parts[0];

    const gu = parts.find((p, idx) => idx >= 1 && p.endsWith('구'));
    if (gu) return gu;

    return parts[1] || parts[0];
}

/** 📍 **관제웹이 그리는 정거장 통째 주소** — 판정 글자(shared `stopQueryOf`) · 배차망이 없으면 기본 배차망 규칙 */
export function stopFullOf(call: { targetApp?: TargetAppType | null }, stop: CallStop | null | undefined): string {
    return stopQueryOf(call.targetApp ?? DEFAULT_TARGET_APP, stop).text;
}

/** 🏷️ **관제웹이 그리는 정거장 짧은 이름** — 판정 글자의 짧은 이름(화물24시 «…와동왕복» → «와동») */
export function stopLabelOf(call: { targetApp?: TargetAppType | null }, stop: CallStop | null | undefined): string {
    return getAddressLabel(stopFullOf(call, stop));
}

/**
 * 전화 걸기 링크 — 만드는 곳은 여기 하나다.
 * 하이픈·공백·괄호를 걷어내되 국제번호 `+` 는 남긴다.
 */
export function telHref(phone?: string | null): string | undefined {
    if (!phone) return undefined;
    const digits = phone.replace(/[^0-9+]/g, '');
    return digits ? `tel:${digits}` : undefined;
}

/**
 * ✂️ **시트 상태바에 넣을 만큼만 자른 지명** (기사님 확정).
 *
 * 지명은 대개 3~4자(`초월읍`·`가산동`)인데, 아파트·상호가 그 자리에 들어오면
 * `경기광주자연앤자이점`(10자)·`더샵오포센트럴포레`(9자)처럼 길어진다.
 * 한 줄(폰 400px)이 약 56칸인데 이런 이름이 들면 71칸까지 가서 **넘친다.**
 *
 * 🔴 **자르되 잘렸다고 말한다** — `…` 를 붙인다. 말없이 자르면 «저게 이름 전부»로 읽힌다 (규칙 ④).
 */
export const STOP_LABEL_MAX = 6;

export function shortStopLabel(name: string, max = STOP_LABEL_MAX): string {
    if (!name) return name;
    return name.length <= max ? name : name.slice(0, max) + '…';
}
