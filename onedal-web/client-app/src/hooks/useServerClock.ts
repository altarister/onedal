import { useEffect, useRef, useState } from 'react';
import { apiBase } from '../lib/serverTarget';
import { measureOffset, CLOCK_RESYNC_MS, type ClockSync } from '../lib/serverClock';

/**
 * 🕐 **서버 시계를 맞춰 들고 있는다** (기사님).
 *
 * 🔴 **재는 곳은 여기 하나다** (규칙 ③). 화면은 `serverNow(sync)` 로 읽기만 한다 —
 *    여러 자리가 각자 재면 같은 화면에 두 시각이 뜬다.
 * 🔴 `/api/health` 는 **인증이 없다** — 로그인 전에도 맞춘다.
 * 🔴 실패하면 `null` 로 둔다. **폰 시계로 조용히 되돌아가지 않고**, 화면이
 *    «못 맞췄다»를 말할 수 있게 한다 (규칙 ④).
 */
export function useServerClock(): ClockSync | null {
    const [sync, setSync] = useState<ClockSync | null>(null);
    /** 끝난 뒤 늦게 온 응답이 상태를 덮지 않게 */
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        const measure = async () => {
            const sentAt = Date.now();
            try {
                const res = await fetch(`${apiBase()}/health`, { cache: 'no-store' });
                const data = await res.json();
                if (!alive.current || typeof data?.now !== 'number') return;
                setSync(measureOffset(sentAt, Date.now(), data.now));
            } catch {
                /* 못 맞췄다 — 지어내지 않고 그대로 둔다 */
            }
        };
        measure();
        const t = setInterval(measure, CLOCK_RESYNC_MS);
        /** 📱 폰이 자다 깨면 그동안 시계가 흘렀다 — 돌아오는 즉시 다시 잰다 */
        const onWake = () => { if (document.visibilityState === 'visible') measure(); };
        document.addEventListener('visibilitychange', onWake);
        return () => {
            alive.current = false;
            clearInterval(t);
            document.removeEventListener('visibilitychange', onWake);
        };
    }, []);

    return sync;
}
