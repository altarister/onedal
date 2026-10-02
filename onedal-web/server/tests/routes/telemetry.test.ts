import fs from "fs";
import os from "os";
import path from "path";
import db from "../../src/db";
import telemetryRouter from "../../src/routes/telemetry";
import { approvedUser } from '../fixtures/approvedUser';

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
        // 🔑 연결된 폰만 받는다 · 자기 폰 기록만 준다 — 이 폰을 읽는 기사에게 잇는다 (reviews/29 1단계)
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES ('test-user', 'g-test-user', 'tu@test', 'tu')`).run();
        approvedUser('test-user');   // 🪪 폰 문은 승인 전 계정을 막는다(core/accountGate)
        db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES ('test-user', ?)`).run(testDeviceId);
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
        db.prepare("DELETE FROM user_devices WHERE user_id = 'test-user' AND device_id = ?").run(testDeviceId);
    });

    describe("📷 사진이 실린 보고 — 레포 밖 폴더에 쓰고 칸을 채운다 · 사진이 깨져도 글 줄은 남는다 (reviews/37)", () => {
        const DEV = "TEST-DEVICE-SHOT";
        const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 7)]);
        let dir: string;
        const before = process.env.SHOTS_DIR;
        const post = async (screenshotBase64: string | null) => {
            const h = (telemetryRouter as any).stack.find((l: any) => l.route?.path === "/anomalies" && l.route?.methods?.post).route.stack[0].handle;
            let out: any = null;
            const res: any = { json: (d: any) => { out = d; }, status: () => res };
            await h({ body: { deviceId: DEV, targetApp: "kakaopicker", screenName: "UNKNOWN", failureReason: "SCREEN_UNKNOWN: 시험", detailParsedText: "시험 화면 글", screenshotBase64 } }, res);
            return out;
        };
        const rowOf = (id: number) => db.prepare("SELECT * FROM telemetry_anomalies WHERE id = ?").get(id) as any;
        beforeAll(() => {
            dir = fs.mkdtempSync(path.join(os.tmpdir(), "onedal-shots-route-"));
            process.env.SHOTS_DIR = dir;
            db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES ('test-user', 'g-test-user', 'tu@test', 'tu')`).run();
            approvedUser('test-user');
            db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES ('test-user', ?)`).run(DEV);
        });
        afterAll(() => {
            if (before === undefined) delete process.env.SHOTS_DIR; else process.env.SHOTS_DIR = before;
            fs.rmSync(dir, { recursive: true, force: true });
            db.prepare("DELETE FROM telemetry_anomalies WHERE device_id = ?").run(DEV);
            db.prepare("DELETE FROM user_devices WHERE device_id = ?").run(DEV);
        });

        it("JPEG 이 실리면 파일이 생기고 screenshot_path 가 찬다", async () => {
            const out = await post(JPEG.toString("base64"));
            expect(out.success).toBe(true);
            const row = rowOf(out.id);
            expect(row.screenshot_path).toBe(`kakaopicker-${out.id}.jpg`);
            expect(fs.existsSync(path.join(dir, row.screenshot_path))).toBe(true);
        });
        it("사진이 없으면(옛 원달앱) 지금처럼 글 줄만", async () => {
            const out = await post(null);
            expect(out.success).toBe(true);
            expect(rowOf(out.id).screenshot_path).toBeNull();
            expect(rowOf(out.id).detail_parsed_text).toBe("시험 화면 글");
        });
        it("사진이 깨졌으면 사진만 버리고 글 줄은 저장", async () => {
            const out = await post(Buffer.from("not a jpeg").toString("base64"));
            expect(out.success).toBe(true);
            expect(rowOf(out.id).screenshot_path).toBeNull();
            expect(rowOf(out.id).failure_reason).toBe("SCREEN_UNKNOWN: 시험");
        });
    });
});
