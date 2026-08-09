import db from "../db";

export class PlaceRepository {
    /**
     * 장소를 DB에 저장하거나 이미 존재하면 방문 횟수를 1 증가시킵니다 (UPSERT).
     */
    public static upsertPlace(
        addressDetail: string, 
        customerName: string, 
        region: string, 
        x: number | null, 
        y: number | null, 
        phone1: string | null
    ): number | undefined {
        const stmtPlace = db.prepare(`
            INSERT INTO places (addressDetail, customerName, region, x, y, phone1, visitCount, lastVisitedAt)
            VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now','localtime'))
            ON CONFLICT(addressDetail, customerName)
            DO UPDATE SET
                visitCount = visitCount + 1,
                lastVisitedAt = datetime('now','localtime'),
                x = COALESCE(excluded.x, x),
                y = COALESCE(excluded.y, y),
                phone1 = COALESCE(excluded.phone1, phone1),
                region = COALESCE(excluded.region, region)
            RETURNING id
        `);
        
        const pPlace = stmtPlace.get(addressDetail, customerName, region, x, y, phone1) as { id: number } | undefined;
        return pPlace?.id;
    }

    /**
     * [Phase 8.4] 이 장소에서 겪은 일을 누적한다.
     *
     * 신고와 실측이 크게 어긋난 곳은 다음에도 그럴 확률이 높다.
     * `blacklistMemo` 컬럼은 예전부터 있었지만 쓰는 코드가 없었다 —
     * 여기가 그 컬럼의 첫 사용처다. 다음에 같은 곳을 잡을 때 미리 보여준다.
     */
    public static appendPlaceMemo(placeId: number, line: string) {
        db.prepare(`
            UPDATE places
            SET blacklistMemo = CASE
                WHEN blacklistMemo IS NULL OR blacklistMemo = '' THEN ?
                ELSE blacklistMemo || char(10) || ?
            END
            WHERE id = ?
        `).run(line, line, placeId);
    }

    /** 오더의 특정 정거장에 연결된 place id */
    public static findPlaceIdByStop(orderId: string, stopType: 'pickup' | 'dropoff'): number | null {
        const row = db.prepare(`SELECT placeId FROM orderStops WHERE orderId = ? AND stopType = ?`)
                      .get(orderId, stopType) as { placeId: number } | undefined;
        return row?.placeId ?? null;
    }
}
