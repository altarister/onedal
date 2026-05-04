import db from "../db";
import { PricingConfig, mapVehicleToKakaoCarType } from "@onedal/shared";

export class SettingsRepository {
    /** 
     * DB에서 기사의 요율 설정(차종별 단가, 수수료율, 할인율)을 로드합니다.
     * 서버 전용 데이터이므로 앱으로 전송되지 않습니다.
     */
    public static loadPricingConfig(userId: string): PricingConfig {
        const row = db.prepare("SELECT vehicle_rates, agency_fee_percent, max_discount_percent FROM user_filters WHERE user_id = ?").get(userId) as any;
        const defaultRates: Record<string, number> = {
            "오토바이": 700, "다마스": 800, "라보": 900, "승용차": 900,
            "1t": 1000, "1.4t": 1100, "2.5t": 1200, "3.5t": 1300,
            "5t": 1500, "11t": 2000, "25t": 2500, "특수화물": 3000
        };
        return {
            vehicleRates: row?.vehicle_rates ? JSON.parse(row.vehicle_rates) : defaultRates,
            agencyFeePercent: row?.agency_fee_percent ?? 23,
            maxDiscountPercent: row?.max_discount_percent ?? 10
        };
    }

    /**
     * 카카오 길찾기를 위한 사용자 디폴트 설정(차종 우선순위 등)을 로드합니다.
     */
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
