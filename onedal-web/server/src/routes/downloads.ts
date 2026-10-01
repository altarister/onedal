import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DEVICE_LINK_ERRORS, type DownloadLink } from "@onedal/shared";
import { requireAuth } from "../middlewares/authMiddleware";
import { accountGateOf } from "../core/accountGate";
import { latestRows, releaseOf, releasesDir, type ReleaseApp } from "../core/releases";
import { slog } from "../utils/fileLogger";

/**
 * 📥 **앱 받기** (reviews/29 4단계 · 관제웹 가입 «앱 받기» 쪽이 부른다 · `appReleases` 검사).
 * 폰 브라우저 내려받기는 머리 칸(Bearer)을 못 실어서, 로그인한 기사가 `POST /links` 로 짧은 열쇠 주소를 받고 그 주소를 연다.
 * 🔴 열쇠는 1회가 아니라 [DOWNLOAD_KEY_MS] 동안 여러 번 — 안드로이드 내려받기 관리자가 같은 주소를 두 번 부른다(머리 확인 · 다시 받기).
 * 이어받기(Range)는 받지 않는다(`Accept-Ranges: none`) — 처음부터 다시 받는다.
 * 막힌 계정(승인 전 · 정지 · 탈퇴)은 링크를 못 받는다 — 판단은 폰 문과 같은 한 곳(`accountGate`).
 */
export const DOWNLOAD_KEY_MS = 10 * 60_000;
const keys = new Map<string, { app: ReleaseApp; versionCode: number; until: number }>();

export function issueDownloadKey(app: ReleaseApp, versionCode: number, now = Date.now()): string {
    for (const [k, v] of keys) if (v.until < now) keys.delete(k);
    const key = crypto.randomBytes(24).toString("base64url");
    keys.set(key, { app, versionCode, until: now + DOWNLOAD_KEY_MS });
    return key;
}

export function findDownloadKey(key: string, now = Date.now()): { app: ReleaseApp; versionCode: number } | null {
    const v = keys.get(key);
    if (!v) return null;
    if (v.until < now) { keys.delete(key); return null; }
    return { app: v.app, versionCode: v.versionCode };
}

const router = Router();

router.post("/links", requireAuth, (req, res) => {
    const userId = (req as any).user?.id as string;
    if (!userId || accountGateOf(userId).blocked) return res.status(403).json({ error: DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED });
    const links: DownloadLink[] = latestRows().map(r => ({
        app: r.app, versionName: r.version_name, versionCode: r.version_code, sizeBytes: r.size_bytes, sha256: r.sha256,
        url: `/api/downloads/${issueDownloadKey(r.app, r.version_code)}`,
    }));
    return res.json(links);
});

router.get("/:key", (req, res) => {
    const k = findDownloadKey(req.params.key);
    const row = k && releaseOf(k.app, k.versionCode);
    const file = row && path.join(releasesDir(), row.file_name);
    if (!row || !file || !fs.existsSync(file)) return res.status(404).json({ error: "받기 주소가 지났거나 없다 — 다시 받으세요" });
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Length', String(fs.statSync(file).size));
    res.setHeader('Content-Disposition', `attachment; filename="onedal-${row.app}-${row.version_name.replace(/[^\w.-]/g, '_')}.apk"`);
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'HEAD') return res.end();
    slog('통신', `📥 [앱 받기] ${row.app} ${row.version_name} (code ${row.version_code})`);
    fs.createReadStream(file).pipe(res);
});

export default router;
