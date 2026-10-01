// @ts-nocheck
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * 📏 **두 지점 거리는 한 함수** (공통 함수 3 · onedal-1f «가») — 몸통과 지구 반지름(6371)은 shared callNet 의 haversineKm 하나.
 * 서버 · 관제웹 · 운행일지 · 운영센터에 숫자 넷 함수(lat, lng, lat, lng)를 두지 않는다 — (x, y) 로 넘기면 북쪽 200m 가 121m 가 되는 순서 실수 자리였다.
 */
const WEB = join(__dirname, '../../..');
const ROOTS = ['server/src', 'shared/src', 'client-app/src', 'logbook/src', 'ops/src'];
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = ROOTS.flatMap(r => walk(join(WEB, r))).filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('📏 두 지점 거리 한 함수', () => {
    it('🔴 지구 반지름 6371 은 shared callNet 한 곳뿐', () => {
        /* 계산에 쓰인 6371 만 — 곱하기 · 값 넣기(지도 자료 파일 속 좌표 숫자는 아니다) */
        const hits = files.filter(f => /(\*\s*6_?371(?:000)?\b|\b6_?371(?:000)?\s*[*;]|=\s*6_?371(?:000)?\b)/.test(code(f))).map(f => relative(WEB, f));
        expect(hits).toEqual(['shared/src/callNet.ts']);
    });
    it('🔴 옛 이름(숫자 넷 함수 · 복사본)이 남아 있지 않다', () => {
        const hits = files.filter(f => /\b(getDistanceKm|haversineMeters|haversineKmOf)\b/.test(code(f))).map(f => relative(WEB, f));
        expect(hits).toEqual([]);
        expect(code(join(WEB, 'server/src/services/geoService.ts'))).not.toMatch(/export function haversineKm/);
    });
});
