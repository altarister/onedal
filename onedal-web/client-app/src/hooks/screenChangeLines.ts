import { deviceLabel, deviceScreenBadge, type DeviceSession } from "@onedal/shared";

const screenKey = (d: DeviceSession) => `${d.screenContext}|${d.screenPage ?? ''}|${d.screenOverlay ?? ''}`;
const screenName = (d: DeviceSession) => deviceScreenBadge(d)?.label ?? d.screenContext ?? '모름';

/**
 * 🖥️ **화면이 바뀐 폰만 «받았다» 한 줄** — 서버 «🖥️ [화면 바뀜]» 시각과 빼서 «서버 → 관제웹» 지연을 잰다.
 * `[웹 수신]` 은 서버 중계 유지 목록(`RELAY_KEEP`)에 든다 · 처음 받은 폰은 직전을 모르니 안 적는다 · 이름은 폰 줄 배지와 같다.
 */
export function screenChangeLines(prev: DeviceSession[], next: DeviceSession[]): string[] {
    const before = new Map(prev.map(d => [d.deviceId, d]));
    return next.flatMap(d => {
        const old = before.get(d.deviceId);
        if (!old || screenKey(old) === screenKey(d)) return [];
        return [`🟢 [웹 수신] 화면 ${deviceLabel(d)} · ${screenName(old)} → ${screenName(d)}`];
    });
}
