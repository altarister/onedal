import db from "../../src/db";
import telemetryRouter from "../../src/routes/telemetry";

describe("📸 이상 징후(telemetry) 라우트 및 DB 저장 검증", () => {
    it("telemetry_anomalies 테이블이 생성되어 있다", () => {
        const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='telemetry_anomalies'").get() as any;
        expect(table).toBeDefined();
        expect(table.name).toBe("telemetry_anomalies");
    });

    it("필수 항목이 누락된 요청은 400을 반환한다", async () => {
        const req: any = {
            body: {
                deviceId: "",
                targetApp: "kakaopicker",
                failureReason: ""
            }
        };
        let statusCode = 200;
        let responseJson: any = null;
        const res: any = {
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (data: any) => {
                responseJson = data;
            }
        };

        // telemetryRouter 내부의 POST /anomalies 핸들러 테스트
        const postHandler = (telemetryRouter as any).stack.find(
            (layer: any) => layer.route?.path === "/anomalies" && layer.route?.methods?.post
        )?.route?.stack[0]?.handle;

        expect(postHandler).toBeDefined();
        await postHandler(req, res);

        expect(statusCode).toBe(400);
        expect(responseJson.success).toBe(false);
    });

    it("정상적인 이상 징후 페이로드가 DB에 정확히 기록되고 조회된다", async () => {
        const testDeviceId = "TEST-DEVICE-A24-999";
        const testPayload = {
            timestamp: "2026-09-19T02:00:00.000Z",
            deviceId: testDeviceId,
            targetApp: "kakaopicker",
            screenName: "DETAIL_PRE_CONFIRM",
            failureReason: "DROPOFF_TEXT_MISSING_AND_OCR_MISMATCH",
            listOrderInfo: {
                fare: 5700,
                pickup: "분당 야탑3",
                dropoff: "분당 이매1"
            },
            detailParsedText: "픽업지 경기 성남시 분당구 야탑3동 ...",
            screenshotBase64: null,
            ocrResult: {
                extractedPickup: "야탑3동 푸라닭",
                extractedDropoff: null
            }
        };

        const postHandler = (telemetryRouter as any).stack.find(
            (layer: any) => layer.route?.path === "/anomalies" && layer.route?.methods?.post
        )?.route?.stack[0]?.handle;

        let postResult: any = null;
        const resPost: any = {
            json: (data: any) => { postResult = data; },
            status: () => resPost
        };

        await postHandler({ body: testPayload }, resPost);

        expect(postResult).toBeDefined();
        expect(postResult.success).toBe(true);
        expect(postResult.id).toBeDefined();

        // DB 직접 조회 검증
        const row = db.prepare("SELECT * FROM telemetry_anomalies WHERE id = ?").get(postResult.id) as any;
        expect(row).toBeDefined();
        expect(row.device_id).toBe(testDeviceId);
        expect(row.target_app).toBe("kakaopicker");
        expect(row.screen_name).toBe("DETAIL_PRE_CONFIRM");
        expect(row.failure_reason).toBe("DROPOFF_TEXT_MISSING_AND_OCR_MISMATCH");

        const parsedListInfo = JSON.parse(row.list_order_info);
        expect(parsedListInfo.fare).toBe(5700);
        expect(parsedListInfo.pickup).toBe("분당 야탑3");

        const parsedOcr = JSON.parse(row.ocr_result);
        expect(parsedOcr.extractedPickup).toBe("야탑3동 푸라닭");
        expect(parsedOcr.extractedDropoff).toBeNull();

        // GET /anomalies 핸들러 및 인증 미들웨어 검증
        const getRoute = (telemetryRouter as any).stack.find(
            (layer: any) => layer.route?.path === "/anomalies" && layer.route?.methods?.get
        )?.route;

        expect(getRoute).toBeDefined();
        expect(getRoute.stack.length).toBeGreaterThanOrEqual(2); // requireAuth + handler

        const getHandler = getRoute.stack[getRoute.stack.length - 1]?.handle;

        let getResult: any = null;
        const resGet: any = {
            json: (data: any) => { getResult = data; },
            status: () => resGet
        };

        await getHandler({ query: { limit: 10 }, user: { id: "test-user" } }, resGet);
        expect(getResult.success).toBe(true);
        expect(getResult.data.some((r: any) => r.id === postResult.id)).toBe(true);

        // 테스트 데이터 정리
        db.prepare("DELETE FROM telemetry_anomalies WHERE id = ?").run(postResult.id);
    });
});
