// @ts-nocheck
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import db from '../../src/db';
import {
    receiveApk, commitRelease, addRelease, listReleases, setMinimum, scrapReleaseCodes, assertOutsideRepo, ReleaseError, RELEASE_LIMIT_BYTES,
} from '../../src/core/releases';
import { issueDownloadKey, findDownloadKey, DOWNLOAD_KEY_MS } from '../../src/routes/downloads';
import downloadsRouter from '../../src/routes/downloads';
import { DEVICE_LINK_ERRORS } from '@onedal/shared';

/**
 * 📦 **앱 배포 서버 문** (reviews/29 4단계 · onedal-1f «가» 셋 고쳐서).
 * 표가 비면 원달앱 보고 응답에 판 칸이 없다(기사 흐름 무변화) · APK 는 메모리가 아니라 레포 밖 폴더로 흘려 쓴다 ·
 * 받기 열쇠는 10분 동안 여러 번(내려받기 관리자가 같은 주소를 두 번 부른다) · 최소 판은 앱마다 한 줄.
 */
const apk = (n = 2048) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), crypto.randomBytes(n)]);
let dir: string;
beforeEach(() => { db.prepare(`DELETE FROM app_releases`).run(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-')); });
afterAll(() => db.prepare(`DELETE FROM app_releases`).run());

describe('앱 배포', () => {
    it('🔴 표가 비면 원달앱 보고 응답에 판 칸이 없다 · scrap 이 그 함수로 싣는다', () => {
        expect(scrapReleaseCodes()).toEqual({});
        const scrap = fs.readFileSync(path.join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        expect(scrap).toContain('...scrapReleaseCodes()');
    });

    it('🔴 흘려 받기 — 해시·크기를 같이 재고 임시 파일까지만 · 표 넣기가 된 뒤에 제자리', async () => {
        const buf = apk();
        const r = await receiveApk(Readable.from([buf]), { dir, app: 'scanner', versionCode: 60, limit: RELEASE_LIMIT_BYTES });
        expect(r.sha256).toBe(crypto.createHash('sha256').update(buf).digest('hex'));
        expect(r.sizeBytes).toBe(buf.length);
        commitRelease({ dir, tmpPath: r.tmpPath, app: 'scanner', versionCode: 60, versionName: '2.9.13', sha256: r.sha256, sizeBytes: r.sizeBytes, uploadedBy: 'admin' });
        expect(fs.readdirSync(dir)).toEqual(['scanner-60.apk']);
    });

    it('🔴 zip 머리가 아니면 400 · 상한을 넘으면 413 — 둘 다 파일이 안 남는다', async () => {
        await expect(receiveApk(Readable.from([Buffer.from('not a zip file at all')]), { dir, app: 'scanner', versionCode: 61, limit: 1_000_000 }))
            .rejects.toMatchObject({ status: 400 });
        await expect(receiveApk(Readable.from([apk(5000)]), { dir, app: 'scanner', versionCode: 62, limit: 1000 }))
            .rejects.toMatchObject({ status: 413 });
        expect(fs.readdirSync(dir)).toEqual([]);
    });

    it('🔴 최신은 판 번호가 가장 큰 줄 — 낮은 판을 올려도 안 바뀐다 · 같은 판은 409', () => {
        addRelease({ app: 'scanner', versionCode: 60, versionName: '2.9.13', fileName: 'a.apk', sha256: 'x', sizeBytes: 1, uploadedBy: 'admin' });
        addRelease({ app: 'scanner', versionCode: 58, versionName: '2.9.11', fileName: 'b.apk', sha256: 'y', sizeBytes: 1, uploadedBy: 'admin' });
        expect(listReleases().find(r => r.isLatest)?.versionCode).toBe(60);
        expect(scrapReleaseCodes()).toEqual({ appLatestCode: 60 });
        expect(() => addRelease({ app: 'scanner', versionCode: 60, versionName: 'dup', fileName: 'c.apk', sha256: 'z', sizeBytes: 1, uploadedBy: 'admin' }))
            .toThrow(expect.objectContaining({ status: 409 }));
    });

    it('🔴 최소 판 — 최신보다 높거나 없는 판은 400 · 앱마다 한 줄만 참', () => {
        addRelease({ app: 'scanner', versionCode: 58, versionName: 'a', fileName: 'a.apk', sha256: 'x', sizeBytes: 1, uploadedBy: 'admin' });
        addRelease({ app: 'scanner', versionCode: 60, versionName: 'b', fileName: 'b.apk', sha256: 'y', sizeBytes: 1, uploadedBy: 'admin' });
        expect(() => setMinimum('scanner', 61)).toThrow(expect.objectContaining({ status: 400 }));
        setMinimum('scanner', 58); setMinimum('scanner', 60);
        expect(db.prepare(`SELECT COUNT(*) n FROM app_releases WHERE app = 'scanner' AND is_minimum = 1`).get().n).toBe(1);
        expect(scrapReleaseCodes()).toEqual({ appLatestCode: 60, appMinimumCode: 60 });
    });

    it('🔴 APK 폴더가 레포 안이면 거부한다', () => {
        const repo = path.resolve(__dirname, '../../../..');
        expect(() => assertOutsideRepo(path.join(repo, 'onedal-web/server/releases'), repo)).toThrow(ReleaseError);
        expect(() => assertOutsideRepo(dir, repo)).not.toThrow();
    });

    it('🔴 받기 열쇠는 10분 동안 여러 번 · 지나면 없다', () => {
        const key = issueDownloadKey('scanner', 60, 1_000);
        expect(findDownloadKey(key, 2_000)).toMatchObject({ app: 'scanner', versionCode: 60 });
        expect(findDownloadKey(key, 3_000)).toMatchObject({ app: 'scanner' });
        expect(findDownloadKey(key, 1_000 + DOWNLOAD_KEY_MS + 1)).toBeNull();
        const src = fs.readFileSync(path.join(__dirname, '../../src/routes/downloads.ts'), 'utf8');
        expect(src).toContain("'Accept-Ranges', 'none'");
    });

    it('🔴 막힌 계정(승인 전)은 받기 링크를 못 받는다', async () => {
        const U = 'test-release-pending';
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
        db.prepare(`UPDATE users SET approved_at = NULL WHERE id = ?`).run(U);
        const layer = downloadsRouter.stack.find((l: any) => l.route?.path === '/links' && l.route.methods.post);
        const h = layer.route.stack[layer.route.stack.length - 1].handle;
        let status = 200, out: any;
        const res = { status: (s: number) => { status = s; return res; }, json: (b: any) => { out = b; return res; } };
        await h({ user: { id: U }, headers: {}, body: {} }, res);
        expect(status).toBe(403);
        expect(out.error).toBe(DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    });

    it('🔴 같은 판 번호가 거의 동시에 둘 — 표 줄을 먼저 잡은 쪽만 제자리 · 뒤엣것 409 · 디스크 해시 = 표 해시', async () => {
        const r1 = await receiveApk(Readable.from([apk()]), { dir, app: 'scanner', versionCode: 63, limit: RELEASE_LIMIT_BYTES });
        const r2 = await receiveApk(Readable.from([apk()]), { dir, app: 'scanner', versionCode: 63, limit: RELEASE_LIMIT_BYTES });
        const meta = { dir, app: 'scanner', versionCode: 63, versionName: 'x', uploadedBy: 'admin' };
        commitRelease({ ...meta, tmpPath: r1.tmpPath, sha256: r1.sha256, sizeBytes: r1.sizeBytes });
        expect(() => commitRelease({ ...meta, tmpPath: r2.tmpPath, sha256: r2.sha256, sizeBytes: r2.sizeBytes })).toThrow(expect.objectContaining({ status: 409 }));
        const disk = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'scanner-63.apk'))).digest('hex');
        expect(disk).toBe(db.prepare(`SELECT sha256 FROM app_releases WHERE app = 'scanner' AND version_code = 63`).get().sha256);
        expect(fs.readdirSync(dir)).toEqual(['scanner-63.apk']);
    });

    it('🔴 깨진 % 머리 칸은 500 이 아니라 400', async () => {
        const opsReleases = (await import('../../src/routes/opsReleases')).default;
        const layer = opsReleases.stack.find((l: any) => l.route?.path === '/releases' && l.route.methods.post);
        const h = layer.route.stack[layer.route.stack.length - 1].handle;
        let status = 200;
        const res = { status: (s: number) => { status = s; return res; }, json: () => res, setHeader: () => res, on: () => res };
        const req: any = Readable.from([apk()]);
        req.headers = { 'x-release-app': 'scanner', 'x-version-code': '64', 'x-version-name': '%E0%A4%A', 'x-file-name': 'a.apk' };
        req.user = { id: 'admin' };
        await h(req, res);
        expect(status).toBe(400);
    });
});
