import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { buildKakaoNaviUrl, buildKakaoRouteUrl, type NaviStop } from '@onedal/shared';

/**
 * 🧭 **다음 정거장 하나를 QR 로 건넨다** (기사님 확정 2026-09-04)
 *
 * ── 왜 QR 인가 ──
 * 기사님이 그으신 선 셋을 **다 지키는 길이 이것뿐이다:**
 * | 개인폰은 내비게이션만 | 우리 화면도 앱도 없다 — **카메라만** 쓴다 |
 * | 비용 없음            | 0원 (문자는 발송 서비스가 붙어야 한다) |
 * | 관제앱은 앞에 있어야   | QR 을 띄우는 것이 관제앱이라 계속 앞에 있다 |
 *
 * 🔴 **관제폰에서 카카오내비를 열면 안 된다** — 관제앱이 뒤로 가면 소켓이 끊기고
 *    `soundManager` 의 소리도 안 난다. **주행 중 합짐 콜을 못 받는다.**
 *    폰을 셋으로 나눈 이유가 GPS 만이 아니었다.
 *
 * ── 흐름 ──
 * ```
 * 도착 → 관제폰 화면에 QR → 개인폰 카메라 → 카카오내비가 그 한 곳으로 안내
 * ```
 * 🟢 **우리 서버도 인터넷도 안 거친다.** QR 안의 글자를 개인폰이 읽어 그대로 실행한다.
 *
 * ⚠️ **경유지를 안 쓴다** — 카카오내비 한도가 3개인데 한 판이 3콜이면 경유 5개가 필요하다.
 *    한 구간씩 보내면 그 한도가 무의미해지고, «지나면 넘어가나·재탐색이 순서를 지키나»를
 *    물을 것도 사라진다 (경로.md §4-1).
 */

/** 카카오맵으로 되돌아갈 길 — 카카오내비가 별로면 같은 자리에서 바꾼다 */
export type QrKind = 'navi' | 'map';

interface Props {
    /** 다음 정거장. 없으면 아무것도 안 그린다 */
    stop: NaviStop | null;
    /** 지금 위치 — 카카오맵 링크에만 쓴다 (카카오내비는 생략하면 현위치에서 시작) */
    here?: { x: number; y: number } | null;
    kind: QrKind;
    onKindChange?: (k: QrKind) => void;
    /** 화면에 그릴 한 변(px) */
    size: number;
    /** 카카오 JavaScript 앱 키. 없으면 카카오내비 QR 을 못 만든다 */
    naviKey?: string;
    naviOrigin?: string;
    vehicleType?: number;
}

/**
 * 🔴 **못 만들면 아무것도 안 그린다** (규칙 ④) — 깨진 QR 을 띄우느니 없는 게 낫다.
 *    부르는 쪽이 `null` 을 보고 버튼을 숨긴다.
 */
export function naviQrText(p: Omit<Props, 'size' | 'onKindChange'>): string | null {
    if (!p.stop) return null;
    if (p.kind === 'map') {
        return buildKakaoRouteUrl(p.here ?? null, [{ x: p.stop.x, y: p.stop.y }]);
    }
    return buildKakaoNaviUrl({
        key: p.naviKey ?? '',
        origin: p.naviOrigin ?? '',
        dest: p.stop,
        vehicleType: p.vehicleType,
    });
}

export default function NaviQr(props: Props) {
    const { size } = props;
    const canvas = useRef<HTMLCanvasElement>(null);
    const [failed, setFailed] = useState(false);
    const text = naviQrText(props);

    useEffect(() => {
        if (!canvas.current || !text) return;
        /**
         * 🔴 **오류 정정 수준을 L 로 둔다.** 카카오내비 주소는 JSON 이 통째로 들어가
         *    길어서, 정정 수준을 올리면 칸이 촘촘해져 **카메라가 못 읽는다.**
         *    화면에 띄우는 QR 이라 찢어지거나 더러워질 일이 없다.
         * 🔴 **여백(margin)을 남긴다** — 없으면 배경과 붙어 인식이 떨어진다.
         */
        QRCode.toCanvas(canvas.current, text, {
            width: size, margin: 2, errorCorrectionLevel: 'L',
            color: { dark: '#000000', light: '#FFFFFF' },
        }).then(() => setFailed(false)).catch(() => setFailed(true));
    }, [text, size]);

    if (!text) return null;

    return (
        <div className="flex flex-col items-center gap-2">
            {/* 🔴 QR 바탕은 **언제나 흰색**이다 — 테마를 따라가면 어두운 테마에서 안 읽힌다 */}
            <div className="bg-white rounded-lg p-2" style={{ lineHeight: 0 }}>
                <canvas ref={canvas} width={size} height={size} />
            </div>
            {failed && (
                <p className="text-[12px] font-bold text-danger">QR 을 못 만들었습니다</p>
            )}
        </div>
    );
}
