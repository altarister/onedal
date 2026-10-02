import fs from "fs";
import os from "os";
import path from "path";
import db from "../db";
import { assertOutsideRepo } from "./releases";
import { slog } from "../utils/fileLogger";

/**
 * 📷 **못 알아본 배차망 화면의 사진** — 원달앱이 이상 기록(«SCREEN_UNKNOWN …»)에 실어 보낸 사진을 받아 두고 지운다 (reviews/37).
 *
 * 🔴 사진은 가리지 않은 원본이다 — 고객 이름 · 전화 · 주소가 찍힐 수 있다. 그래서
 *   ① 파일은 레포 밖 폴더(`SHOTS_DIR` · 기본 홈의 onedal-shots)에만 쓴다 — 폴더는 서버가 만들지 않는다(실서버는 처음 한 번 사람이 만든다)
 *   ② 여는 문은 운영센터 문 하나다(`routes/ops.ts` · requireOps) — 회원 문은 사진 칸을 안 낸다
 *   ③ `SHOT_KEEP_DAYS` 가 지나면 파일을 지우고 칸을 비운다 — 줄과 글 200자는 남는다
 * 셋 다 `anomalyShotGuards` · `anomalyShots` 검사가 문다.
 * 사진은 곁다리다 — 쓰지 못해도 이상 기록 글 줄은 그대로 저장된다.
 */

/** 보관 날수 — 배차망이 화면을 바꾸면 그 주 안에 정의 표에 한 줄 더한다, 한 달이면 넉넉하다. 설정창 값이 아니다(읽는 곳이 지우기 하나) */
export const SHOT_KEEP_DAYS = 30;

/** 사진 한 장 상한 — 원달앱은 540폭 JPEG 60 으로 보낸다(한 장 수십~백여 KB) */
export const SHOT_LIMIT_BYTES = 500 * 1024;

const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff]);
const NETWORK_CODE = /^[a-z0-9]+$/;
const SWEEP_EVERY_MS = 3_600_000;

/** 사진 폴더 — 환경 값 SHOTS_DIR, 없으면 홈의 onedal-shots */
export function shotsDir(): string {
    return path.resolve(process.env.SHOTS_DIR || path.join(os.homedir(), "onedal-shots"));
}

/** 받은 사진(base64)을 `<배차망>-<줄 번호>.jpg` 로 쓴다 — 쓰면 폴더 안 상대 경로, 못 쓰면 그 까닭 */
export function saveShot(id: number, targetApp: string, base64: string, dir = shotsDir()): { path: string } | { skip: string } {
    if (!NETWORK_CODE.test(targetApp)) return { skip: `배차망 이름이 이상하다(${targetApp})` };
    try { assertOutsideRepo(dir, undefined, { name: "사진 폴더", env: "SHOTS_DIR" }); } catch (e) { return { skip: (e as Error).message }; }
    if (!fs.existsSync(dir)) return { skip: `사진 폴더 없음(${dir})` };
    if (base64.length > Math.ceil(SHOT_LIMIT_BYTES / 3) * 4 + 4) return { skip: "상한을 넘는다" };
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > SHOT_LIMIT_BYTES) return { skip: "상한을 넘는다" };
    if (bytes.length <= JPEG_HEAD.length || !bytes.subarray(0, JPEG_HEAD.length).equals(JPEG_HEAD)) return { skip: "JPEG 가 아니다" };
    const name = `${targetApp}-${id}.jpg`;
    try { fs.writeFileSync(path.join(dir, name), bytes); } catch (e) { return { skip: `쓰기 실패(${(e as Error).message})` }; }
    return { path: name };
}

/** 칸에 적힌 이름 → 폴더 안 절대 경로. 폴더 밖 · 하위 폴더 · 절대 경로는 null */
export function shotFileOf(rel: string, dir = shotsDir()): string | null {
    if (!rel || rel !== path.basename(rel) || rel === "." || rel === "..") return null;
    return path.join(dir, rel);
}

/** 보관 날수가 지난 줄 — 파일을 지우고 칸을 비운다(줄은 남는다). 비운 줄 수 */
export function sweepExpiredShots(dir = shotsDir()): number {
    const rows = db.prepare(`SELECT id, screenshot_path FROM telemetry_anomalies
        WHERE screenshot_path IS NOT NULL AND created_at < datetime('now', 'localtime', ?)`).all(`-${SHOT_KEEP_DAYS} days`) as { id: number; screenshot_path: string }[];
    const clear = db.prepare(`UPDATE telemetry_anomalies SET screenshot_path = NULL WHERE id = ?`);
    for (const r of rows) {
        const file = shotFileOf(r.screenshot_path, dir);
        if (file) fs.rmSync(file, { force: true });
        clear.run(r.id);
    }
    return rows.length;
}

/** 뜰 때 한 번(부팅을 안 붙잡는다) + 한 시간마다 지운다 */
export function startShotSweep(): void {
    const run = () => {
        try {
            const n = sweepExpiredShots();
            if (n) slog('부팅', `📷 [이상 기록 사진] ${SHOT_KEEP_DAYS}일 지난 ${n}장을 지움(줄은 남음)`);
        } catch (e) {
            slog('경고', `📷 [이상 기록 사진] 지우기 실패 — 다음 시간에 다시: ${(e as Error).message}`);
        }
    };
    setImmediate(run);
    setInterval(run, SWEEP_EVERY_MS).unref();
}
