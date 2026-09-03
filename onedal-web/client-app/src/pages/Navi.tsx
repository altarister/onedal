import { useMemo } from 'react';
import { useNaviRoute } from '../hooks/useNaviRoute';
import { useLocationStore } from '../stores/useLocationStore';
import { buildKakaoRouteUrl, httpsUpgradeUrl, isRouteTruncated, KAKAO_MAX_VIA, type NaviPoint } from '@onedal/shared';
import { getAddressLabel } from '../lib/routeUtils';

/**
 * 🧭 **내비 한 장 — 개인 폰(아이폰)이 여는 화면** (기사님 기획 2026-08-19 · 만듦 2026-09-03)
 *
 * 기사님: *"내비게이션만 볼 내 개인 폰에서 받아서 링크를 클릭해 내비를 작동하려는 기획이야.
 * 그래야 이 폰으로는 관제웹을 계속 트래킹할 수 있으니까."*
 *
 * 폰 셋의 역할이 갈린다 — **A24 스캔 · S23 관제 · 아이폰 내비.**
 * 이 화면에는 지도도 콜 목록도 결재 버튼도 없다. **큰 버튼 하나**뿐이다.
 *
 * 🔴 **여기서는 위치를 보내지 않는다** (`App.tsx` 가 `/navi` 면 GPS 훅을 끈다).
 *    보내면 관제폰과 좌표가 한 차량으로 섞여 도착·지나침 판정이 흔들린다
 *    (기사님 지적: *"관제가 2개 열리면 안된다고 한것 같은데."*).
 *
 * ⚠️ **알림은 없다.** 사파리를 열어 둔 채여야 하고, 카카오맵에서 돌아오는 손짓이 필요하다.
 *    그게 번거로우면 문자(SMS) 로 링크를 보내는 쪽이 낫다 — 그건 발송 서비스가 붙어야 한다.
 */
export default function Navi() {
    const { routeStops, calls, isConnected } = useNaviRoute();
    const { lat, lng, error: gpsError, isTracking, setLocation, setError } = useLocationStore();

    /**
     * 🧭 **순서는 서버가 정한 것을 그대로 쓴다** — 관제웹은 자기 TSP 를 돌리지 않는다 (규칙 ③).
     * 다녀온 정거장이 `routeStops` 에서 빠지는 것이 여기서 그대로 값어치를 한다.
     */
    const stops = useMemo(() => {
        const out: Array<NaviPoint & { label: string }> = [];
        for (const s of routeStops ?? []) {
            const o = calls.find((c: any) => c.id === s.orderId) as any;
            if (!o) continue;
            const x = s.stopType === 'pickup' ? o.pickupX : o.dropoffX;
            const y = s.stopType === 'pickup' ? o.pickupY : o.dropoffY;
            if (typeof x !== 'number' || typeof y !== 'number') continue;   // 좌표를 지어내지 않는다
            out.push({
                x, y,
                label: `${getAddressLabel(s.stopType === 'pickup' ? o.pickup : o.dropoff)} ${s.stopType === 'pickup' ? '상차' : '하차'}`,
            });
        }
        return out;
    }, [routeStops, calls]);

    const here: NaviPoint | null = lat != null && lng != null ? { x: lng, y: lat } : null;
    const url = buildKakaoRouteUrl(here, stops);
    const cut = isRouteTruncated(stops);
    /** 🔒 위치를 못 읽는 진짜 까닭이 «http» 일 때, 옮겨 갈 곳을 손에 쥐여 준다 */
    const secure = typeof window !== 'undefined' ? httpsUpgradeUrl(window.location.href) : null;

    return (
        <div className="min-h-screen bg-surface text-text px-5 py-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
                <h1 className="text-[20px] font-black tracking-tight">🧭 내비</h1>
                <span className={`text-[12px] font-bold ${isConnected ? 'text-success' : 'text-danger animate-pulse'}`}>
                    {isConnected ? '연결됨' : '연결 끊김'}
                </span>
            </div>

            {stops.length === 0 ? (
                /* 🔴 «경로 없음»과 «못 만들었다»를 가른다 — 빈 화면은 고장처럼 보인다 */
                <p className="text-[15px] text-text-muted leading-relaxed">
                    아직 보낼 경로가 없습니다.<br />
                    관제폰에서 콜을 <b>KEEP</b> 하면 여기에 뜹니다.
                </p>
            ) : (
                <>
                    <ol className="flex flex-col gap-1.5 text-[15px] font-bold tabular-nums">
                        {stops.map((s, i) => (
                            <li key={i} className={i > KAKAO_MAX_VIA ? 'text-text-muted opacity-50' : ''}>
                                <span className="text-text-muted mr-2">{i + 1}.</span>{s.label}
                                {i > KAKAO_MAX_VIA && <span className="ml-2 text-[12px]">— 다음에</span>}
                            </li>
                        ))}
                    </ol>

                    {cut && (
                        <p className="text-[13px] text-warning font-bold leading-relaxed">
                            ⚠️ 카카오맵은 경유지를 {KAKAO_MAX_VIA}곳까지만 받습니다 —
                            앞의 {KAKAO_MAX_VIA + 1}곳만 보냅니다. 도착하면 나머지가 여기에 다시 뜹니다.
                        </p>
                    )}

                    {url ? (
                        /* 🔴 운전 중에 먼발치로 1~2초에 눌러야 한다 — 크게, 하나만 */
                        <a href={url}
                           className="mt-2 block rounded-2xl px-6 py-6 text-center text-[22px] font-black text-white active:scale-95 transition-transform"
                           style={{ background: 'linear-gradient(180deg,#5b8cff,#3f6fe0)', boxShadow: '0 8px 24px rgba(79,141,249,.45)' }}>
                            🧭 카카오맵으로 열기
                            <span className="block mt-1 text-[13px] font-bold opacity-90">
                                경유 {Math.min(stops.length - 1, KAKAO_MAX_VIA)}곳 · 도착 {stops[Math.min(stops.length, KAKAO_MAX_VIA + 1) - 1].label}
                            </span>
                        </a>
                    ) : (
                        /**
                         * 위치를 모르면 «어디서부터»가 없다 — 지어내지 않고 **왜 없는지**를 적는다 (규칙 ④).
                         * 🔴 위치는 **이 기기**가 잰다(서버가 주는 게 아니다). 그래서 못 받는 까닭도 여기에 있다:
                         *    ① 브라우저 위치 권한을 안 줬다  ② `http` 라 브라우저가 막았다(위치는 https 에서만)
                         */
                        <div className="text-[14px] text-warning font-bold leading-relaxed">
                            이 기기의 위치를 아직 못 읽었습니다 — 링크는 <b>지금 여기서 출발</b>로 만듭니다.

                            {/* 🔴 **브라우저가 준 사유를 그대로 보여 준다** (기사님 실물 2026-09-03).
                                화면이 «권한을 허용해 주세요»라고만 하면, 사유가 그게 아닐 때
                                **찾을 데가 없다.** 사유는 이미 `useLocationStore.error` 에 있었는데
                                이 화면이 안 읽고 있었다 (규칙 ⑤ «읽는 곳»이 비어 있던 자리). */}
                            {gpsError && (
                                <p className="mt-2 font-medium text-[13px] text-danger">
                                    브라우저가 준 사유: <b>{gpsError}</b>
                                </p>
                            )}
                            {!gpsError && isTracking && (
                                <p className="mt-2 font-medium text-[13px] text-text-muted">
                                    위치를 찾는 중입니다… (실내면 시간이 걸립니다)
                                </p>
                            )}
                            {secure ? (
                                /* 🔴 «권한을 허용해 주세요»는 이때 **손댈 데가 없는 안내**다 —
                                   권한 문제가 아니라 주소 문제이므로, 옮겨 갈 곳을 눌러서 준다 */
                                <>
                                    <p className="mt-2 font-medium text-[13px] text-text-muted">
                                        지금 <b>http</b> 로 열려 있습니다. 브라우저는 <b>https</b> 에서만 위치를 줍니다.
                                    </p>
                                    <a href={secure}
                                       className="mt-3 block rounded-2xl px-6 py-5 text-center text-[18px] font-black text-white active:scale-95 transition-transform"
                                       style={{ background: 'linear-gradient(180deg,#f0a02a,#d8821a)' }}>
                                        🔒 https 로 다시 열기
                                    </a>
                                </>
                            ) : (
                                <>
                                    <ul className="mt-2 font-medium text-[13px] list-disc pl-5 text-text-muted">
                                        <li>아래 버튼을 누르면 브라우저가 <b>위치 권한</b>을 묻습니다</li>
                                        <li>왼쪽 위에 <b>✕</b> 가 있으면 <b>다른 앱 안의 브라우저</b>입니다 —
                                            그 안에서는 위치를 안 주는 경우가 많으니 <b>사파리</b>로 여세요
                                            (공유 → «사파리로 열기»)</li>
                                        <li>한 번 거절했다면 주소창의 <b>ⓘ / 자물쇠</b>에서 다시 켭니다</li>
                                    </ul>
                                    <button
                                        onClick={() => {
                                            setError(null);
                                            navigator.geolocation.getCurrentPosition(
                                                (pos) => setLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy || 0),
                                                (e) => setError(e.message),
                                                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
                                            );
                                        }}
                                        className="mt-3 w-full rounded-2xl px-6 py-5 text-center text-[18px] font-black text-white active:scale-95 transition-transform"
                                        style={{ background: 'linear-gradient(180deg,#f0a02a,#d8821a)' }}>
                                        📍 위치 다시 요청
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}

            <p className="mt-auto text-[12px] text-text-muted leading-relaxed">
                이 화면은 <b>위치를 보내지 않습니다</b> — 관제폰의 트래킹과 섞이지 않게 일부러 꺼 뒀습니다.
            </p>
        </div>
    );
}
