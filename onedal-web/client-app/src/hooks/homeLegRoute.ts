import { apiBase } from '../lib/serverTarget';

/**
 * 🏠 **모의 주행 — 집으로 떠나는 도로 경로를 받는다** (시험 도구 · 개발 빌드 전용).
 *
 * 🔄 **지금은 아무도 안 부른다** (#133 개정 — 모의 주행은 경로 끝에서 그 자리 대기). 파일 지우기는 기사님이 말씀하실 때만이라 남겨 뒀다.
 *
 * `/api/sim/route`(개발 전용 · 카카오)로 «지금 자리 → 내 주소» 한 구간을 받는다. 못 받으면 null — 직선을 지어내지 않는다.
 * 🔴 판단(`homeLeg.homeLegNeeded`)과 파일을 가른다 — 모의 주행 훅이 서버 주소(`import.meta`)를 끌어오지 않게. 이 함수는 `useMasterGps` 가 넘긴다.
 */
type Pt = { x: number; y: number };

export async function fetchHomeLeg(from: Pt, home: Pt): Promise<Pt[] | null> {
    try {
        const r = await fetch(`${apiBase()}/sim/route`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: [from, home] }),
        });
        if (!r.ok) return null;
        const d = await r.json() as { legs?: Pt[][] };
        const leg = d.legs?.[0];
        return leg && leg.length >= 2 ? leg : null;
    } catch {
        return null;
    }
}
