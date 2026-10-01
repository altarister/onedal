import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { Transform, type Readable } from "stream";
import { pipeline } from "stream/promises";
import type { OpsRelease } from "@onedal/shared";
import db from "../db";

/**
 * 📦 **앱 판 — 표 · 파일 · 원달앱 응답 칸을 한 곳에서** (reviews/29 4단계 · `appReleases` 검사).
 * - APK 는 메모리에 안 담는다 — 받는 흐름을 임시 파일로 흘려 쓰며 sha256 · 크기를 같이 잰다(실서버 EC2 는 기사 서버와 같은 프로세스).
 * - 파일은 레포 밖 폴더(RELEASES_DIR · 기본 ~/onedal-releases) — 레포 안이면 거부한다(배포가 작업 폴더를 갈아도 안 지워지게).
 * - «최신»은 앱마다 판 번호가 가장 큰 줄 · «최소»는 앱마다 한 줄. 원달앱 응답 칸은 메모리에 담고 올리기 · 최소 지정 때만 다시 읽는다(보고가 초당 온다).
 */
export type ReleaseApp = OpsRelease['app'];
export const RELEASE_APPS: readonly ReleaseApp[] = ['scanner', 'dashboard'];

/** 올리기 상한 — 원달앱 배포판 APK 약 52MB(10-01 assembleRelease 실측 · 개발판 약 55MB)의 네 배 남짓 */
export const RELEASE_LIMIT_BYTES = 200 * 1024 * 1024;

export class ReleaseError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/** APK 폴더 — 환경 값 RELEASES_DIR, 없으면 홈의 onedal-releases */
export function releasesDir(): string {
    return path.resolve(process.env.RELEASES_DIR || path.join(os.homedir(), "onedal-releases"));
}

/** 레포 안이면 거부 — 배포(git reset · clean)가 APK 를 지우거나 git 에 올라가지 않게 */
export function assertOutsideRepo(dir: string, repoRoot = REPO_ROOT): void {
    const d = path.resolve(dir), r = path.resolve(repoRoot);
    if (d === r || d.startsWith(r + path.sep)) throw new ReleaseError(500, `APK 폴더가 레포 안이다 (${d}) — RELEASES_DIR 를 레포 밖으로`);
}

const ZIP_HEAD = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * 📥 **받는 흐름을 임시 파일로** — 상한을 흐름에서 세어 넘으면 끊는다(413) · 끝나면 첫 4바이트가 zip 머리인지(400).
 * 제자리 두기는 [commitRelease] 가 표 줄을 잡은 뒤에 한다. 실패하면 임시 파일을 지운다 — 반쯤 쓴 APK 가 남지 않는다.
 */
export async function receiveApk(input: Readable, opts: { dir: string; app: ReleaseApp; versionCode: number; limit: number }):
    Promise<{ tmpPath: string; sha256: string; sizeBytes: number }> {
    fs.mkdirSync(opts.dir, { recursive: true });
    const tmp = path.join(opts.dir, `.upload-${opts.app}-${opts.versionCode}-${process.pid}-${crypto.randomBytes(4).toString("hex")}.tmp`);
    const hash = crypto.createHash("sha256");
    let size = 0;
    /* 상한 초과는 깃발로도 적는다 — 흐름 묶음(pipeline)은 부하가 크면 이 오류 대신 «일찍 닫힘»을 먼저 돌려줄 수 있어, 그때도 413 이 되게 */
    let overLimit = false;
    const counter = new Transform({
        transform(chunk: Buffer, _enc, done) {
            size += chunk.length;
            if (size > opts.limit) { overLimit = true; return done(new ReleaseError(413, `APK 가 ${Math.round(opts.limit / 1024 / 1024)}MB 를 넘는다`)); }
            hash.update(chunk);
            done(null, chunk);
        },
    });
    try {
        await pipeline(input, counter, fs.createWriteStream(tmp));
        const head = Buffer.alloc(4);
        const fd = fs.openSync(tmp, "r");
        try { fs.readSync(fd, head, 0, 4, 0); } finally { fs.closeSync(fd); }
        if (!head.equals(ZIP_HEAD)) throw new ReleaseError(400, "APK 가 아니다 (zip 머리가 없다)");
        return { tmpPath: tmp, sha256: hash.digest("hex"), sizeBytes: size };
    } catch (e) {
        try { fs.unlinkSync(tmp); } catch { /* 이미 없다 */ }
        if (overLimit) throw new ReleaseError(413, `APK 가 ${Math.round(opts.limit / 1024 / 1024)}MB 를 넘는다`);
        throw e instanceof ReleaseError ? e : new ReleaseError(400, `APK 를 받지 못했다 (${(e as Error).message})`);
    }
}

interface Row { app: ReleaseApp; version_code: number; version_name: string; file_name: string; sha256: string; size_bytes: number; is_minimum: number; uploaded_at: string }

let codes: { appLatestCode?: number; appMinimumCode?: number } | null = null;
const forget = () => { codes = null; };

function latestCode(app: ReleaseApp): number | null {
    return (db.prepare(`SELECT MAX(version_code) c FROM app_releases WHERE app = ?`).get(app) as { c: number | null }).c;
}

/** 운영센터 표 — 앱마다 새 판부터. «최신»은 계산 */
export function listReleases(): OpsRelease[] {
    const rows = db.prepare(`SELECT * FROM app_releases ORDER BY app, version_code DESC`).all() as Row[];
    const latest = new Map(RELEASE_APPS.map(a => [a, latestCode(a)]));
    return rows.map(r => ({
        app: r.app, version: r.version_name, versionCode: r.version_code, fileName: r.file_name, sha256: r.sha256,
        uploadedAt: r.uploaded_at, isLatest: latest.get(r.app) === r.version_code, isMinimum: r.is_minimum === 1,
    }));
}

/** 같은 앱 · 같은 판 번호가 있으면 409 — 올리기 전에 먼저 묻는다(큰 파일을 받고 나서 거절하지 않게) */
export function assertNewVersion(app: ReleaseApp, versionCode: number): void {
    if (db.prepare(`SELECT 1 FROM app_releases WHERE app = ? AND version_code = ?`).get(app, versionCode))
        throw new ReleaseError(409, `${app} 판 번호 ${versionCode} 는 이미 있다`);
}

export function addRelease(r: { app: ReleaseApp; versionCode: number; versionName: string; fileName: string; sha256: string; sizeBytes: number; uploadedBy: string | null }): void {
    assertNewVersion(r.app, r.versionCode);
    db.prepare(`INSERT INTO app_releases (app, version_code, version_name, file_name, sha256, size_bytes, uploaded_at, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)`).run(r.app, r.versionCode, r.versionName, r.fileName, r.sha256, r.sizeBytes, r.uploadedBy);
    forget();
}

/**
 * 📦 **표 줄 넣기 → 파일 제자리** 를 한 묶음으로 (ab 리뷰 · onedal-1f).
 * 같은 판 번호가 거의 동시에 둘 오면 표 줄(UNIQUE)을 먼저 잡은 쪽만 파일을 둔다 — 뒤엣것은 409 · 앞 파일을 덮지 않는다.
 * 파일 두기는 rename 이 아니라 link(이미 있으면 실패) — 실패하면 묶음이 표 줄도 되돌린다. 임시 파일은 늘 지운다.
 */
export function commitRelease(r: { dir: string; tmpPath: string; app: ReleaseApp; versionCode: number; versionName: string; sha256: string; sizeBytes: number; uploadedBy: string | null }): string {
    const fileName = `${r.app}-${r.versionCode}.apk`;
    try {
        db.transaction(() => {
            try {
                db.prepare(`INSERT INTO app_releases (app, version_code, version_name, file_name, sha256, size_bytes, uploaded_at, uploaded_by)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)`).run(r.app, r.versionCode, r.versionName, fileName, r.sha256, r.sizeBytes, r.uploadedBy);
            } catch (e) {
                if (String((e as Error).message).includes("UNIQUE")) throw new ReleaseError(409, `${r.app} 판 번호 ${r.versionCode} 는 이미 있다`);
                throw e;
            }
            try { fs.linkSync(r.tmpPath, path.join(r.dir, fileName)); }
            catch (e) {
                if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new ReleaseError(409, `${fileName} 파일이 이미 있다`);
                throw e;
            }
        })();
    } finally {
        try { fs.unlinkSync(r.tmpPath); } catch { /* 이미 없다 */ }
    }
    forget();
    return fileName;
}

/** 최소 판 — 그 판이 있고 최신 이하일 때만 · 앱마다 한 줄만 참(한 묶음) */
export function setMinimum(app: ReleaseApp, versionCode: number): void {
    db.transaction(() => {
        const has = db.prepare(`SELECT 1 FROM app_releases WHERE app = ? AND version_code = ?`).get(app, versionCode);
        if (!has) throw new ReleaseError(400, `${app} 판 번호 ${versionCode} 가 없다`);
        const latest = latestCode(app);
        if (latest !== null && versionCode > latest) throw new ReleaseError(400, "최소 판이 최신보다 높을 수 없다");
        db.prepare(`UPDATE app_releases SET is_minimum = 0 WHERE app = ?`).run(app);
        db.prepare(`UPDATE app_releases SET is_minimum = 1 WHERE app = ? AND version_code = ?`).run(app, versionCode);
    })();
    forget();
}

/** 한 판 — 받기 문이 파일을 찾는다 */
export function releaseOf(app: ReleaseApp, versionCode: number): Row | undefined {
    return db.prepare(`SELECT * FROM app_releases WHERE app = ? AND version_code = ?`).get(app, versionCode) as Row | undefined;
}

/** 앱별 최신 줄 — 받기 링크가 읽는다 */
export function latestRows(): Row[] {
    return RELEASE_APPS.map(a => { const c = latestCode(a); return c === null ? undefined : releaseOf(a, c); }).filter((r): r is Row => !!r);
}

/** 원달앱 보고 응답 칸 — 표가 비면 빈 객체(칸 없음 → 앱은 아무것도 안 띄운다) */
export function scrapReleaseCodes(): { appLatestCode?: number; appMinimumCode?: number } {
    if (codes) return codes;
    const latest = latestCode("scanner");
    const min = db.prepare(`SELECT version_code c FROM app_releases WHERE app = 'scanner' AND is_minimum = 1`).get() as { c: number } | undefined;
    codes = { ...(latest !== null ? { appLatestCode: latest } : {}), ...(min ? { appMinimumCode: min.c } : {}) };
    return codes;
}
