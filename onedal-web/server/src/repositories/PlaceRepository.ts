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
}
