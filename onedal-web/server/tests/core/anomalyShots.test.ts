import fs from "fs";
import os from "os";
import path from "path";
import db from "../../src/db";
import { saveShot, shotFileOf, sweepExpiredShots, SHOT_LIMIT_BYTES } from "../../src/core/anomalyShots";

/**
 * 📷 이상 기록 사진 — 받은 사진을 레포 밖 폴더에 쓰고, 30일이 지나면 파일을 지우고 칸을 비운다(줄은 남는다).
 * 사진은 가리지 않은 원본이라 지우기가 꼭 돌아야 한다 (reviews/37).
 */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const b64 = (b: Buffer) => b.toString("base64");

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "onedal-shots-test-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("📷 saveShot — 받은 사진을 폴더에 쓴다", () => {
    it("JPEG 이면 <배차망>-<id>.jpg 로 쓰고 상대 경로를 돌려준다", () => {
        const r = saveShot(7, "kakaopicker", b64(JPEG), dir);
        expect(r).toEqual({ path: "kakaopicker-7.jpg" });
        expect(fs.readFileSync(path.join(dir, "kakaopicker-7.jpg")).equals(JPEG)).toBe(true);
    });
    it("JPEG 머리가 아니면 안 쓴다", () => {
        expect(saveShot(7, "kakaopicker", b64(Buffer.from("not a jpeg at all")), dir)).toHaveProperty("skip");
        expect(fs.readdirSync(dir)).toEqual([]);
    });
    it("상한을 넘으면 안 쓴다", () => {
        const big = Buffer.concat([JPEG, Buffer.alloc(SHOT_LIMIT_BYTES, 1)]);
        expect(saveShot(7, "kakaopicker", b64(big), dir)).toHaveProperty("skip");
        expect(fs.readdirSync(dir)).toEqual([]);
    });
    it("폴더가 없으면 만들지 않고 안 쓴다", () => {
        const missing = path.join(dir, "없는-폴더");
        expect(saveShot(7, "kakaopicker", b64(JPEG), missing)).toHaveProperty("skip");
        expect(fs.existsSync(missing)).toBe(false);
    });
    it("레포 안 폴더는 거부한다", () => {
        const inRepo = path.resolve(__dirname, "..");
        expect(saveShot(7, "kakaopicker", b64(JPEG), inRepo)).toHaveProperty("skip");
    });
    it("배차망 이름에 경로 글자가 있으면 안 쓴다", () => {
        expect(saveShot(7, "../x", b64(JPEG), dir)).toHaveProperty("skip");
    });
});

describe("📷 shotFileOf — 폴더 안 파일만 연다", () => {
    it("폴더 안 이름은 절대 경로로", () => {
        expect(shotFileOf("kakaopicker-7.jpg", dir)).toBe(path.join(dir, "kakaopicker-7.jpg"));
    });
    it("`..` · 절대 경로 · 하위 폴더는 거부", () => {
        expect(shotFileOf("../x.jpg", dir)).toBeNull();
        expect(shotFileOf("/etc/passwd", dir)).toBeNull();
        expect(shotFileOf("a/b.jpg", dir)).toBeNull();
    });
});

describe("📷 sweepExpiredShots — 30일 지난 사진은 파일을 지우고 칸을 비운다 · 줄은 남는다", () => {
    const DEV = "dev-shot-sweep";
    const insert = (daysAgo: number, file: string) => {
        fs.writeFileSync(path.join(dir, file), JPEG);
        return Number(db.prepare(`INSERT INTO telemetry_anomalies (timestamp, device_id, target_app, failure_reason, screenshot_path, created_at)
            VALUES (datetime('now'), ?, 'kakaopicker', 'SCREEN_UNKNOWN: 시험', ?, datetime('now', 'localtime', ?))`).run(DEV, file, `-${daysAgo} days`).lastInsertRowid);
    };
    afterEach(() => { db.prepare(`DELETE FROM telemetry_anomalies WHERE device_id = ?`).run(DEV); });

    it("31일 지난 줄 — 파일 없어짐 · 칸 NULL · 줄은 남음 / 29일 줄 — 그대로", () => {
        const old = insert(31, "kakaopicker-old.jpg");
        const fresh = insert(29, "kakaopicker-fresh.jpg");
        expect(sweepExpiredShots(dir)).toBeGreaterThanOrEqual(1);
        const rowOld = db.prepare(`SELECT screenshot_path FROM telemetry_anomalies WHERE id = ?`).get(old) as { screenshot_path: string | null } | undefined;
        expect(rowOld).toBeDefined();
        expect(rowOld!.screenshot_path).toBeNull();
        expect(fs.existsSync(path.join(dir, "kakaopicker-old.jpg"))).toBe(false);
        const rowFresh = db.prepare(`SELECT screenshot_path FROM telemetry_anomalies WHERE id = ?`).get(fresh) as { screenshot_path: string | null };
        expect(rowFresh.screenshot_path).toBe("kakaopicker-fresh.jpg");
        expect(fs.existsSync(path.join(dir, "kakaopicker-fresh.jpg"))).toBe(true);
    });
    it("표에 없는 파일 · 폴더 밖 파일은 안 건드린다", () => {
        fs.writeFileSync(path.join(dir, "loose.jpg"), JPEG);
        const outside = path.join(os.tmpdir(), `onedal-outside-${process.pid}.jpg`);
        fs.writeFileSync(outside, JPEG);
        const id = Number(db.prepare(`INSERT INTO telemetry_anomalies (timestamp, device_id, target_app, failure_reason, screenshot_path, created_at)
            VALUES (datetime('now'), ?, 'kakaopicker', 'T', ?, datetime('now', 'localtime', '-40 days'))`).run(DEV, `../${path.basename(outside)}`).lastInsertRowid);
        sweepExpiredShots(dir);
        expect(fs.existsSync(path.join(dir, "loose.jpg"))).toBe(true);
        expect(fs.existsSync(outside)).toBe(true);
        expect((db.prepare(`SELECT screenshot_path FROM telemetry_anomalies WHERE id = ?`).get(id) as { screenshot_path: string | null }).screenshot_path).toBeNull();
        fs.rmSync(outside, { force: true });
    });
});
