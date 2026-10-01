// @ts-nocheck
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import http from 'http';
import express from 'express';
import { serveForHost } from '../../src/utils/hostStatic';

/**
 * 🏢 **ops. 주소로 들어온 요청에는 운영센터 화면** (reviews/29 3단계 · onedal-1f «가» · 코드만 — 배포 설정은 DNS 붙일 때).
 * rehearsal. 와 같은 자리(API 뒤 · 관제웹 서빙 앞)에서 Host 로만 가른다 — /api 는 모든 주소에서 산다.
 * 운영센터 빌드가 없으면 조용히 건너뛴다 — 기사용 서버가 안 멈추고 그 주소도 관제웹을 받는다.
 * 진짜 HTTP 로 Host 머리만 바꿔 묻는다.
 */
const dirWith = (body: string) => { const d = mkdtempSync(join(tmpdir(), 'hoststatic-')); writeFileSync(join(d, 'index.html'), body); return d; };
const appWith = (opsDir: string) => {
    const app = express();
    app.get('/api/x', (_req, res) => res.json({ api: true }));
    serveForHost(app, 'ops.', opsDir, '운영센터');
    const web = dirWith('WEB');
    app.use(express.static(web));
    app.use((_req, res) => res.sendFile(join(web, 'index.html')));
    return app;
};
const get = (server: http.Server, host: string, path: string) => new Promise<string>((ok, no) => {
    const { port } = server.address() as any;
    http.get({ host: '127.0.0.1', port, path, headers: { Host: host } }, r => { let b = ''; r.on('data', c => b += c).on('end', () => ok(b)); }).on('error', no);
});
const listen = (app: any) => new Promise<http.Server>(ok => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });

describe('🏢 ops. 주소 → 운영센터 화면', () => {
    it('🔴 ops. 의 첫 화면 · 화면 길은 운영센터 · 다른 주소는 관제웹 · /api 는 정적이 안 덮는다', async () => {
        const server = await listen(appWith(dirWith('OPS')));
        try {
            expect(await get(server, 'ops.altari.com', '/')).toBe('OPS');
            expect(await get(server, 'ops.altari.com', '/members')).toBe('OPS');
            expect(await get(server, 'altari.com', '/')).toBe('WEB');
            expect(JSON.parse(await get(server, 'ops.altari.com', '/api/x'))).toEqual({ api: true });
        } finally { server.close(); }
    });
    it('🔴 운영센터 빌드가 없으면 건너뛴다 — ops. 주소도 관제웹(기사용 서버가 안 멈춘다)', async () => {
        const server = await listen(appWith(join(tmpdir(), 'no-such-ops-dist-' + Date.now())));
        try {
            expect(await get(server, 'ops.altari.com', '/')).toBe('WEB');
        } finally { server.close(); }
    });
    it('🔴 서버 입구가 rehearsal · ops 두 번 부르고 관제웹 서빙보다 앞', () => {
        const idx = readFileSync(join(__dirname, '../../src/index.ts'), 'utf8');
        const r = idx.indexOf('serveForHost(app, REHEARSAL_HOST'), o = idx.indexOf('serveForHost(app, OPS_HOST'), web = idx.indexOf('app.use(express.static(clientBuildPath))');
        expect(r).toBeGreaterThan(-1); expect(o).toBeGreaterThan(-1);
        expect(r < web && o < web).toBe(true);
    });
});
