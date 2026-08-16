export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function getMinuteDiff(start?: string, end?: string) {
    if (!start || !end || start === '?' || end === '?') return null;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 1440;
    return diff;
}

export function getAddressLabel(addr: string) {
    if (!addr) return "배차값없음";
    const parts = addr.split(' ');
    if (parts.length <= 1) return addr;

    // 1순위: 동/읍/면 또는 종로3가 같은 '가' 로 끝나는 법정동 탐색
    const dong = parts.find((p, idx) => idx >= 1 && (p.match(/[동읍면]$/) || p.match(/\d+가$/)));
    if (dong) return dong;

    // 2순위: 1기 신도시처럼 '구' 단위까지만 나오는 경우 
    const gu = parts.find((p, idx) => idx >= 1 && p.endsWith('구'));
    if (gu) return gu;

    return parts[1] || parts[0];
}

/**
 * 전화 걸기 링크. 같은 정규식이 네 곳에 복사돼 있었다 (2026-08-10 전수조사).
 * 하이픈·공백·괄호를 걷어내되 국제번호 `+` 는 남긴다.
 */
export function telHref(phone?: string | null): string | undefined {
    if (!phone) return undefined;
    const digits = phone.replace(/[^0-9+]/g, '');
    return digits ? `tel:${digits}` : undefined;
}

/** 시:분 (24시간). 세 곳에 복사돼 있던 포맷 */
export function hhmm(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
