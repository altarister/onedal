/**
 * 🏠 **운영센터 홈의 판단 둘 — 순수 함수** (reviews/33 2단계 · onedal-69 «가» Q3). 숫자를 모으는 것은 routes/ops.ts 의 homeOf.
 */

/**
 * 🔴 배차망 «비상» — 그 배차망 앱이 폰 화면에 떠 있는데(기기 세션의 지금 앱) 30분 동안 실물 읽기(intel source='real')가 0 줄이고
 *    못 읽음(telemetry_anomalies)이 3건 이상이면. 근거: 폰은 몇 초마다 보고하니 30분에 읽은 것 없이 3번 넘게 못 읽으면
 *    일시적인 끊김이 아니라 배차망 화면이 바뀐 것이다. 실측 근거는 아직 없다(실물은 픽커뿐) — 실주행 뒤 다시 맞춘다.
 *    🟡 «주의»는 오늘 처음 보는 글자가 하나라도 있으면.
 */
export const NETWORK_ALARM = { WINDOW_MS: 30 * 60_000, FAILS: 3 } as const;

export function networkLevelOf(f: { shownNow: boolean; readsInWindow: number; failsInWindow: number; newWords: number }): 'ok' | 'warn' | 'alarm' {
    if (f.shownNow && f.readsInWindow === 0 && f.failsInWindow >= NETWORK_ALARM.FAILS) return 'alarm';
    if (f.newWords > 0) return 'warn';
    return 'ok';
}

/** 🚨 진행 중 콜이 있는데 위치가 이만큼 안 오면 기사 이상 신호 (onedal-69 «가» Q2 — 운전 중 폰은 몇 초마다 보낸다) */
export const GPS_STALE_MS = 10 * 60_000;

/**
 * 📍 위치가 안 온다 — 운전석 GPS(관제웹 · session.lastFixAt)와 원달앱 폰 위치(기기 세션 lastLocationAt) 중 **늦은 것**이 10분 넘으면 (onedal-69 «나»).
 *    배차망 앱을 앞에 띄우고 달리면 관제웹은 위치를 멈춘다 — 원달앱 폰이 보고에 위치를 실어 보내는 중이면 «안 옴»이 아니다.
 *    둘 다 모르면(받은 적 없음) 안 온 것이다.
 */
export function locationStaleOf(lastFixAt: number | null | undefined, phoneLocationAts: Array<number | undefined>, now: number): boolean {
    const latest = Math.max(lastFixAt ?? 0, ...phoneLocationAts.map(t => t ?? 0));
    return latest === 0 || now - latest > GPS_STALE_MS;
}

/**
 * 📱 업데이트 필요 — 폰은 판 «이름»만 보낸다(기기 세션 version). 앱 배포 표에서 그 이름의 판 코드를 찾아 최소 판보다 낮으면 참.
 *    표에 없는 이름(개발 판 등) · 최소 판이 없으면 모른다 — 세지 않는다.
 */
export function needsUpdateOf(versionName: string | undefined, releases: Array<{ versionName: string; versionCode: number }>, minimumCode: number | undefined): boolean {
    if (minimumCode == null || !versionName) return false;
    const r = releases.find(x => x.versionName === versionName);
    return !!r && r.versionCode < minimumCode;
}
