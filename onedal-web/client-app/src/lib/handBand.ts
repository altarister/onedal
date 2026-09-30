import { isListScreen, type DeviceSession } from '@onedal/shared';
import { filterAlarmLine } from './filterAlarmLine';

/**
 * 🚧 **«손 필요» 띠 — 기기 상태로 그린다** (onedal-1f).
 * 폰이 목록에 있고 마지막 목록 보고의 «앱이 못 연 까닭»(`lastOpenBlocked`)이 기사님 손이 있어야 풀리는 것이면 띠를 띄운다.
 * 까닭이 그대로인 동안 유지되고, 풀리거나(앱이 열었다 · 통과 콜 없음) 목록을 떠나면 사라진다.
 * 서버 알림(소리)은 까닭이 바뀔 때만 오므로 알림 10초로 띠를 끄면 까닭이 그대로여도 다시 안 뜬다 — 그래서 알림이 아니라 1초마다 오는 기기 상태를 본다.
 */
export function handBandOf(device: DeviceSession, appLabel: string): string | null {
    if (!device.screenContext || !isListScreen(device.screenContext)) return null;
    return filterAlarmLine({ passed: device.filterTally?.passed ?? 0, openBlocked: device.lastOpenBlocked }, appLabel);
}
