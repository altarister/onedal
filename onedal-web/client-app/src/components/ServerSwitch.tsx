import { useEffect, useState } from 'react';
import { TARGETS, apiBase, currentTargetName, isNativeApp, switchTarget } from '../lib/serverTarget';
import type { ServerTarget } from '../lib/serverTarget';

/**
 * 🔊 **서버 고르기 — 볼륨 업으로 연다** (기사님 확정 2026-08-25).
 *
 * 기사님: *"볼륨 버튼을 클릭해서 라이브인지 로컬인지 바꿀 수 있으면 더 좋을 것 같은데."*
 *
 * ── 왜 필요했나 ──
 * 관제앱은 `https://localhost` 에서 자기 번들을 띄운다. 상대 경로 `/api` 가 **자기 자신**
 * 에게 가서, 2026-08-25 실측에서 **구글 인증 토큰을 받고도 보낼 곳이 없어** 로그인이
 * 조용히 되돌아왔다. 브라우저에서는 프록시가 받아 주니 안 드러나고 앱에서만 난다.
 *
 * ── 화면 규칙 (⑤-4 ④) ──
 * 🔴 **지금 어디를 보는지 항상 적는다.** 오늘 «어느 서버를 보고 있나»를 몰라 여러 번
 *    헤맸다 — 로컬을 고쳐 놓고 라이브를 보며 *"왜 안 고쳐졌지"* 를 반복하는 종류다.
 *
 * ⚠️ 브라우저에서는 안 뜬다 — 거기서는 상대 경로가 정답이고 고를 이유가 없다.
 */
export function ServerSwitch() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        /**
         * 🔴 **토글이 아니라 «항상 연다»** (기사님 실측 2026-08-25).
         *
         * 처음엔 `setOpen(v => !v)` 였다. 기사님이 여러 번 누르시자 **누를 때마다
         * 열렸다 닫혔다** 했고, 짝수 번이면 닫힌 채로 끝나 *"아무 반응이 없다"* 가 됐다.
         * 계측 로그가 그대로 말해 줬다 — 볼륨 업 48개(=24번) 도착, 브리지도 정상.
         *
         * 닫는 길은 **닫기 버튼과 바깥 누르기** 둘로 충분하다. 여는 버튼이 닫기도 하면
         * «지금 열려 있나»를 기억해야 하는데, 운전 중에 그걸 기억할 수 없다.
         */
        const onVolume = () => setOpen(true);
        window.addEventListener('onedal:volume-up', onVolume);
        return () => window.removeEventListener('onedal:volume-up', onVolume);
    }, []);

    if (!isNativeApp()) return null;
    if (!open) return null;

    const now = apiBase();
    const pick = (t: ServerTarget) => {
        // 같은 곳을 고르면 새로고침만 낭비다
        if (TARGETS[t].api === now) { setOpen(false); return; }
        switchTarget(t);
    };

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-6"
            onClick={() => setOpen(false)}
        >
            <div
                className="w-full max-w-sm rounded-2xl bg-slate-900 p-5 ring-1 ring-slate-700"
                onClick={e => e.stopPropagation()}
            >
                <div className="mb-1 text-lg font-bold text-white">어느 서버를 볼까</div>
                {/* 🔴 지금 보는 곳을 먼저 말한다 — 고르기 전에 알아야 한다 */}
                <div className="mb-4 text-sm text-slate-400">
                    지금 <span className="font-semibold text-emerald-400">{currentTargetName()}</span>
                    <span className="ml-1 text-slate-500">({now})</span>
                </div>

                {(Object.keys(TARGETS) as ServerTarget[]).map(t => {
                    const isNow = TARGETS[t].api === now;
                    return (
                        <button
                            key={t}
                            onClick={() => pick(t)}
                            className={`mb-2 w-full rounded-xl px-4 py-4 text-left ${
                                isNow ? 'bg-emerald-600/20 ring-1 ring-emerald-500' : 'bg-slate-800'
                            }`}
                        >
                            <div className="text-base font-semibold text-white">
                                {TARGETS[t].label}{isNow && ' · 지금 이것'}
                            </div>
                            <div className="text-xs text-slate-400">{TARGETS[t].api}</div>
                        </button>
                    );
                })}

                <div className="mt-3 text-xs text-slate-500">
                    고르면 저장하고 <b>새로고침</b>합니다 — 소켓도 새 주소로 다시 붙어야 합니다.
                </div>
                <button
                    onClick={() => setOpen(false)}
                    className="mt-3 w-full rounded-xl bg-slate-700 px-4 py-3 text-sm text-slate-200"
                >
                    닫기
                </button>
            </div>
        </div>
    );
}
