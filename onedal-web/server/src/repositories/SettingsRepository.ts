import db from "../db";
import { PricingConfig, mapVehicleToKakaoCarType } from "@onedal/shared";

export class SettingsRepository {
    /** 
     * DB에서 기사의 요율 설정(차종별 단가, 수수료율, 할인율)을 로드합니다.
     * 서버 전용 데이터이므로 앱으로 전송되지 않습니다.
     */
    public static loadPricingConfig(userId: string): PricingConfig {
        const row = db.prepare("SELECT vehicle_rates, agency_fee_percent, eyeline_pct FROM user_filters WHERE user_id = ?").get(userId) as any;
        const defaultRates: Record<string, number> = {
            "오토바이": 700, "다마스": 800, "라보": 900, "승용차": 900,
            "1t": 1000, "1.4t": 1100, "2.5t": 1200, "3.5t": 1300,
            "5t": 1500, "11t": 2000, "25t": 2500, "특수화물": 3000
        };
        return {
            vehicleRates: row?.vehicle_rates ? JSON.parse(row.vehicle_rates) : defaultRates,
            agencyFeePercent: row?.agency_fee_percent ?? 23,
            /**
             * 🔴 2026-08-13 — **`max_discount_percent` 를 `eyeline_pct`(눈높이)가 대체한다.**
             *
             * 둘은 같은 뜻이었다 — "시세에서 얼마나 깎인 것까지 받는가".
             * 같은 뜻의 값이 두 개면 어느 게 진짜인지 화면에서 알 수 없고,
             * 설정에서 하나를 바꿔도 다른 하나가 그대로라 **두 판정이 갈라진다.**
             *
             * 원천은 필터의 눈높이 하나다 (기사님이 사냥 중에 조작하는 값).
             * `max_discount_percent` 컬럼은 남아 있지만 **아무도 읽지 않는다.**
             */
            maxDiscountPercent: row?.eyeline_pct ?? 10
        };
    }

    /**
     * 카카오 길찾기를 위한 사용자 디폴트 설정(차종 우선순위 등)을 로드합니다.
     */
    /**
     * 기사님 집 좌표 (사용자 설정의 '내 주소').
     *
     * [2026-08-12] GPS 대체 출발지로 쓴다. 예전에는 주소와 좌표를 코드에 박아 둔
     * 임시 파일(`services/fallbackOrigin.ts`)이 있었는데, 기사님이 이미 설정 화면에서
     * 같은 주소를 입력해 지오코딩까지 마쳐 둔 상태였다.
     * **이미 있는 값을 두고 상수를 새로 만들 이유가 없다** — 이사하면 설정만 바꾸면 된다.
     *
     * 좌표가 없으면 `null`. 0,0 같은 가짜 좌표를 만들지 않는다.
     */
    public static getHomeLocation(userId: string): { x: number; y: number; address: string } | null {
        const row = db.prepare(
            `SELECT home_address, home_x, home_y FROM user_settings WHERE user_id = ?`
        ).get(userId) as { home_address?: string; home_x?: number; home_y?: number } | undefined;

        if (!row?.home_x || !row?.home_y) return null;
        return { x: row.home_x, y: row.home_y, address: row.home_address || '내 주소' };
    }

    public static getKakaoRoutingOptions(userId: string) {
        const row = db.prepare("SELECT vehicle_type, default_priority FROM user_settings WHERE user_id = ?").get(userId) as any;
        const vehicleTypeStr = row?.vehicle_type || '1t';
        return {
            carType: mapVehicleToKakaoCarType(vehicleTypeStr),
            defaultPriority: row?.default_priority || "RECOMMEND",
            vehicleType: vehicleTypeStr
        };
    }
}
