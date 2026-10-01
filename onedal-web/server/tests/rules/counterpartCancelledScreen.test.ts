import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 📵 **«상대가 취소했다고 함»은 운영센터의 메모다 — 관제웹은 그 칸을 그리지 않는다** (기사님 결정 · onedal-69).
 *    관리자가 전화로 알리면 기사님이 그 콜을 열어 취소를 누르신다. 관제웹에 새 경고 줄 · 표시를 두지 않는다.
 *    서버 단계 보기(stepsView)에는 칸이 실려 오지만 관제웹은 읽지 않는다 — 통화 저장도 그 칸을 싣지 않는다(서버가 그대로 둔다).
 */
const SRC = join(__dirname, '../../../client-app/src');
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
});

describe('📵 상대 취소 — 관제웹은 그리지 않는다', () => {
    it('🔴 관제웹 소스 어디에도 상대 취소 칸을 읽거나 싣는 곳이 없다 · 경고 글자도 없다', () => {
        for (const f of files(SRC)) {
            const src = readFileSync(f, 'utf8');
            expect({ f, hit: /counterpart_cancelled|counterpartCancelled|상대가 취소했다고 함|상대 취소/.test(src) }).toEqual({ f, hit: false });
        }
    });
});
