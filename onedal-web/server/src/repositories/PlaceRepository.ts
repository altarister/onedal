import db from "../db";

export class PlaceRepository {
    /**
     * 장소를 저장하고 그 기사의 방문 횟수를 1 늘린다.
     * 🏪 공용 칸(주소 · 좌표 · 지역 · 상호)은 `places` 한 줄, 개인 칸(방문 수 · 전화)은 `user_places` 기사별 줄 (reviews/29 1단계 C).
     */
    public static upsertPlace(
        userId: string,
        addressDetail: string, 
        customerName: string, 
        region: string, 
        x: number | null, 
        y: number | null, 
        phone1: string | null
    ): number | undefined {
        const pPlace = db.prepare(`
            INSERT INTO places (addressDetail, customerName, region, x, y)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(addressDetail, customerName)
            DO UPDATE SET
                x = COALESCE(excluded.x, x),
                y = COALESCE(excluded.y, y),
                region = COALESCE(excluded.region, region)
            RETURNING id
        `).get(addressDetail, customerName, region, x, y) as { id: number } | undefined;
        if (!pPlace) return undefined;
        db.prepare(`
            INSERT INTO user_places (user_id, place_id, visitCount, lastVisitedAt, phone1)
            VALUES (?, ?, 1, datetime('now','localtime'), ?)
            ON CONFLICT(user_id, place_id)
            DO UPDATE SET
                visitCount = visitCount + 1,
                lastVisitedAt = datetime('now','localtime'),
                phone1 = COALESCE(excluded.phone1, phone1)
        `).run(userId, pPlace.id, phone1);
        return pPlace.id;
    }

    /**
     * 이 장소에서 겪은 일을 누적한다.
     *
     * 신고와 실측이 크게 어긋난 곳은 다음에도 그럴 확률이 높다.
     * `blacklistMemo` 에 적어 두고, 다음에 같은 곳을 잡을 때 미리 보여준다.
     */
    public static appendPlaceMemo(userId: string, placeId: number, line: string) {
        /* 🏪 그 기사의 메모에만 — 줄이 없으면 만든다 */
        db.prepare(`
            INSERT INTO user_places (user_id, place_id, blacklistMemo) VALUES (?, ?, ?)
            ON CONFLICT(user_id, place_id) DO UPDATE SET blacklistMemo = CASE
                WHEN blacklistMemo IS NULL OR blacklistMemo = '' THEN excluded.blacklistMemo
                ELSE blacklistMemo || char(10) || excluded.blacklistMemo
            END
        `).run(userId, placeId, line);
    }

    /** 오더의 특정 정거장에 연결된 place id */
    public static findPlaceIdByStop(orderId: string, stopType: 'pickup' | 'dropoff'): number | null {
        const row = db.prepare(`SELECT placeId FROM orderStops WHERE orderId = ? AND stopType = ?`)
                      .get(orderId, stopType) as { placeId: number } | undefined;
        return row?.placeId ?? null;
    }
}
