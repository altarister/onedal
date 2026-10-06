import { registerPlugin } from '@capacitor/core';
import { isNativeApp, socketBase } from './serverTarget';

/**
 * 📡 **관제앱 공급 서비스 켜고 끄기 — 한 곳** (reviews/50 ①-2 · 관제앱 `SupplyPlugin` · `SupplyService`).
 * 관제앱에서 로그인하면 네이티브 서비스가 서버 공급 소켓에 붙어 필터 · 모드 · 결재를 블루투스로 스캔폰에 넘긴다 — 화면을 꺼도 끊기지 않는다.
 * 🔴 공급 · 결재 소켓 사건은 웹 화면이 다루지 않는다 — 여기서는 토큰 · 서버 주소만 넘긴다. 웹(PC)에서는 아무것도 안 한다.
 * 관제앱을 열 때 · 토큰을 다시 받을 때마다 다시 `start` — 서비스가 만료 토큰을 쥔 채 멈춰 있지 않게.
 */
interface SupplyPlugin {
    start(options: { serverUrl: string; token: string }): Promise<{ started: boolean; denied?: string[] }>;
    stop(): Promise<void>;
}
const Supply = registerPlugin<SupplyPlugin>('Supply');

export function startSupply(): void {
    if (!isNativeApp()) return;
    const token = localStorage.getItem('access_token');
    const serverUrl = socketBase();
    if (!token || !serverUrl) return;
    Supply.start({ serverUrl, token })
        .then(r => { if (!r.started) console.warn('📡 공급 서비스를 못 띄움 — 거절한 권한', r.denied); })
        .catch(e => console.warn('📡 공급 서비스 시작 실패', e));
}

/** 🔴 끝나기를 기다릴 수 있게 약속을 돌려준다 — 로그아웃은 곧바로 화면을 새로 고쳐, 기다리지 않으면 내리기 요청이 끊겨 서비스가 옛 로그인으로 계속 공급했다(폰 시험 10-06) */
export async function stopSupply(): Promise<void> {
    if (!isNativeApp()) return;
    await Supply.stop().catch(e => console.warn('📡 공급 서비스 내리기 실패', e));
}
