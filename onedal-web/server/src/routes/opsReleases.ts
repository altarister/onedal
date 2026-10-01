import { Router, type Request } from "express";
import { RELEASE_UPLOAD_HEADERS, type OpsMinimumRelease } from "@onedal/shared";
import { audit } from "./ops";
import {
    RELEASE_APPS, RELEASE_LIMIT_BYTES, ReleaseError, commitRelease, assertNewVersion, assertOutsideRepo, listReleases, receiveApk, releasesDir, setMinimum,
    type ReleaseApp,
} from "../core/releases";
import { slog } from "../utils/fileLogger";

/**
 * 📦 **운영센터 앱 배포 문** (reviews/29 4단계 · `/api/ops` 와 같은 문지기 requireAuth + requireOps 로 index.ts 에서 붙는다).
 * 쓰기마다 운영센터 기록(ops.ts `audit`) 한 줄. 올리기는 본문이 APK 바이트 그대로 — 메모리에 안 담고 레포 밖 폴더로 흘려 쓴다(`core/releases`).
 * versionCode 는 관리자가 적는 값이다(APK 를 풀어 읽지 않는다) — 원달앱 build.gradle 의 versionCode 와 같게 적는다.
 */
const router = Router();
const adminOf = (req: Request) => (req as any).user?.id as string;
const fail = (res: any, e: unknown) => {
    if (e instanceof ReleaseError) return res.status(e.status).json({ error: e.message });
    slog('경고', `📦 [앱 배포] 처리 실패 — ${(e as Error).message}`);
    return res.status(500).json({ error: "앱 배포 처리 중 오류" });
};

router.get("/releases", (_req, res) => {
    try { res.json(listReleases()); } catch (e) { fail(res, e); }
});

router.put("/releases/minimum", (req, res) => {
    const { app, versionCode } = (req.body ?? {}) as Partial<OpsMinimumRelease>;
    try {
        if (!RELEASE_APPS.includes(app as ReleaseApp) || !Number.isInteger(versionCode)) throw new ReleaseError(400, "앱과 판 번호가 필요하다");
        setMinimum(app as ReleaseApp, versionCode!);
        audit(adminOf(req), '최소 판 지정', null, `${app} code ${versionCode}`);
        res.json(listReleases());
    } catch (e) { fail(res, e); }
});

router.post("/releases", async (req, res) => {
    const h = (k: string) => String(req.headers[k] ?? '').trim();
    const app = h(RELEASE_UPLOAD_HEADERS.app) as ReleaseApp;
    const versionCode = Number(h(RELEASE_UPLOAD_HEADERS.versionCode));
    try {
        let versionName: string, original: string;
        try {
            versionName = decodeURIComponent(h(RELEASE_UPLOAD_HEADERS.versionName));
            original = decodeURIComponent(h(RELEASE_UPLOAD_HEADERS.fileName));
        } catch { throw new ReleaseError(400, "머리 칸 글자가 깨졌다"); }
        if (!RELEASE_APPS.includes(app)) throw new ReleaseError(400, "앱이 scanner · dashboard 가 아니다");
        if (!Number.isInteger(versionCode) || versionCode <= 0) throw new ReleaseError(400, "판 번호(versionCode)는 양의 정수");
        if (!versionName || versionName.length > 40) throw new ReleaseError(400, "판 이름이 비었거나 길다");
        if (!/\.apk$/i.test(original)) throw new ReleaseError(400, "파일 이름이 .apk 가 아니다");
        const declared = Number(req.headers['content-length'] ?? 0);
        if (declared > RELEASE_LIMIT_BYTES) throw new ReleaseError(413, "APK 가 상한을 넘는다");
        assertNewVersion(app, versionCode);
        const dir = releasesDir();
        assertOutsideRepo(dir);
        const r = await receiveApk(req, { dir, app, versionCode, limit: RELEASE_LIMIT_BYTES });
        commitRelease({ dir, tmpPath: r.tmpPath, app, versionCode, versionName, sha256: r.sha256, sizeBytes: r.sizeBytes, uploadedBy: adminOf(req) ?? null });
        audit(adminOf(req), 'APK 올림', null, `${app} ${versionName} (code ${versionCode} · ${Math.round(r.sizeBytes / 1024 / 1024)}MB)`);
        slog('통신', `📦 [앱 배포] ${app} ${versionName} (code ${versionCode}) 올림 · ${r.sizeBytes}바이트 · sha256 ${r.sha256.slice(0, 12)}…`);
        res.json(listReleases());
    } catch (e) {
        // 남은 본문은 받지 않고 끊는다 — 거절 응답이 다 나간 뒤 연결을 닫는다(50MB 를 헛받지 않게)
        res.setHeader('Connection', 'close');
        res.on('finish', () => req.destroy());
        fail(res, e);
    }
});

export default router;
