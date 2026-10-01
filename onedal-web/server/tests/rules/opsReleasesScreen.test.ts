import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📦 **앱 배포 · 앱 받기 화면 — 서버 문만, 받기는 승인 뒤** (reviews/29 4단계 · 04 서버 114c026b · onedal-1f «가»).
 *    🔴 승인 전 계정이 APK 를 받으면 모르는 사람이 앱을 가져간다 — 받기 주소는 서버(403)가 거르고 화면은 «승인되면 설치 안내가 열립니다» 한 줄.
 *    올리기는 본문이 파일 바이트 그대로 · 판 정보는 shared RELEASE_UPLOAD_HEADERS 머리 칸 — 다른 이름을 쓰면 서버가 400.
 */
const WEB = join(__dirname, '../../..');
const read = (f: string) => readFileSync(join(WEB, f), 'utf8');

describe('📦 앱 배포 · 앱 받기 화면', () => {
    it('🔴 운영센터 앱 배포는 서버 문만 — 올리기는 RELEASE_UPLOAD_HEADERS 머리 칸 · 파일 바이트 그대로 · 예시 없음', () => {
        const page = read('ops/src/pages/Releases.tsx');
        expect(page).toContain('api.releases()');
        expect(page).toContain('api.uploadRelease(file, app,');
        expect(page).toContain('api.setMinimum(r.app, r.versionCode)');
        expect(page).not.toMatch(/api\/example|ExampleBand|alert\(/);
        const ops = read('ops/src/api/ops.ts');
        expect(ops).toMatch(/client\.post<OpsRelease\[\]>\('\/ops\/releases', file,/);
        for (const k of ['app', 'versionCode', 'versionName', 'fileName']) expect(ops).toContain(`[RELEASE_UPLOAD_HEADERS.${k}]`);
        expect(ops).toContain("'/ops/releases/minimum'");
    });

    it('🔴 관제웹 앱 받기는 서버 링크(10분 주소)로만 — 승인 전(403)은 «승인되면 설치 안내가 열립니다» · 박힌 판 · 크기 글자 없음', () => {
        const apps = read('client-app/src/pages/JoinApps.tsx');
        expect(apps).toContain('fetchDownloadLinks()');
        expect(apps).toContain('<a href={l.url} download>받기</a>');
        expect(apps).toContain('if (r.blocked) return');
        expect(apps).toContain('승인되면 설치 안내가 열립니다');
        expect(apps).not.toMatch(/version: '|size: '|alert\(/);
        const api = read('client-app/src/api/join.ts');
        expect(api).toMatch(/status === 403\) return \{ links: \[\], blocked: true/);
    });

    it('🔴 승인 대기 · 가입 화면은 앱 받기로 보내지 않는다 — 한 줄로 «승인되면» 만', () => {
        expect(read('client-app/src/pages/Pending.tsx')).not.toContain('to="/join/apps"');
        expect(read('client-app/src/pages/Pending.tsx')).toContain('승인되면 설치 안내가 열립니다');
        expect(read('client-app/src/pages/Join.tsx')).not.toContain('to="/join/apps"');
    });
});
