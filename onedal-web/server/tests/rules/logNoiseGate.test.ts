import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🧹 **서버 로그의 나레이션을 걷고, 관제웹 중계는 유지 목록만** (기사님 «가» · reviews/22 ①-2)
 *
 * ── 왜 ──
 *
 * 코드 흐름 나레이션(«…연산»·«관제탑에게 … 전달»)은 사실이 아니라 코드가 무엇을 하는지의
 * 중계라, 판정·수상한 줄이 그 사이에 묻힌다. 관제웹 브라우저 디버그(그리기·GPS·지도)가
 * 서버 파일의 1/3을 덮었다 — 남길 것은 경고·에러와 «기사님 손»(버튼·국면·필터), 콜 수신,
 * 다녀옴·주행판정뿐이다. 브라우저 콘솔 자체는 그대로다 — 줄이는 것은 서버 파일로 올라가는 중계다.
 */

const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');

describe('🧹 서버 나레이션 — 걷었다', () => {
    const gone: Array<[string, string]> = [
        ['core/engine/OrderEvaluator.ts', '연산");'],
        ['core/engine/OrderEvaluator.ts', '관제탑에게'],
        ['routes/detail.ts', '정제 연산'],
        ['routes/detail.ts', '관제탑에게'],
        ['routes/orders.ts', '캐싱 연산'],
        ['routes/orders.ts', '타이머 감시 연산'],
        ['routes/orders.ts', '스레드 락(Lock) 점검 완료'],
        ['routes/scrap.ts', '관제탑에게'],
        ['services/kakaoService.ts', '폴리라인 길이 예상'],
        ['services/dispatchEngine.ts', '생성 연산'],
        ['services/dispatchEngine.ts', '복구 연산 시작'],
        ['services/dispatchEngine.ts', '복구 연산 완료'],
        ['state/filterManager.ts', '연산 트리거'],
        ['state/filterManager.ts', '반영 후 최종 동작 필터'],
        ['services/geoService.ts', '· 같은 자리 ·'],
    ];
    it.each(gone)('%s 에 «%s» 나레이션이 없다', (file, phrase) => {
        expect(src(file)).not.toContain(phrase);
    });

    it('안전취소 임박은 나레이션이 아니라 경고 사실 줄이다', () => {
        expect(src('routes/detail.ts')).toContain('안전취소 임박');
    });

    it('정차는 매초가 아니라 시작·끝 두 줄이다', () => {
        expect(src('services/geoService.ts')).toContain('정차 시작');
        expect(src('services/geoService.ts')).toContain('정차 끝');
    });

    it('필터 변경은 전문이 아니라 바뀐 칸 + 지문이다', () => {
        expect(src('state/filterManager.ts')).toContain('filterVersionOf(session.activeFilter)');
    });
});

describe('🧹 관제웹 → 서버 중계 — 유지 목록만 싣는다', () => {
    const logs = src('routes/logs.ts');
    it('유지 목록(RELAY_KEEP)이 있다', () => {
        expect(logs).toContain('RELAY_KEEP');
    });
    /* ⚪ 판정 못 함이 그려졌나·보였나 · 🖥️ 창의 코드 판 — 기사님 창을 로그로 가르는 줄 (onedal-1f) */
    it.each(['심사석', '국면', '필터', '웹 수신', '다녀옴', '주행판정', '⚪', '관제웹 코드'])(
        '유지 목록에 «%s» 이 든다', (word) => {
            expect(logs).toContain(word);
        });
});

describe('🧹 한 판 400줄 — 되풀이 줄은 바뀔 때만', () => {
    const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
    it('관제웹 복구 보내기 줄은 콜·상태가 바뀔 때만 적는다 (보내기는 그대로)', () => {
        const s = src('socket/socketHandlers.ts');
        expect(s).toContain('lastRecoverLogSig.get(uid) !== callsSig');
        expect(s).toContain('io.to(uid).emit("sync-active-orders", sync);');
    });
    it('콜이 없는 스크랩 보고는 적지 않는다', () => {
        expect(src('routes/scrap.ts')).toContain("if (data.length > 0) logRoadmapEvent('통신', \"서버\", ` [/api/scrap 수신]");
    });
});

describe('🧹 필터 변경 줄 — 필터가 실제로 바뀐 때만', () => {
    it('지문이 앞서 적은 것과 같으면 다시 적지 않는다', () => {
        const s = readFileSync(join(__dirname, '../../src/state/filterManager.ts'), 'utf8');
        expect(s).toContain('if (lastFilterLogSig.get(session) === sig) return;');
    });
});

describe('🧮 스크랩 응답의 누적 수 — 표는 처음 한 번만 센다 (서버 병목 14)', () => {
    it('첫 요청만 COUNT 를 부르고, 그 뒤엔 넣는 줄 수만큼 더한다 — 빈 보고도 콜이 실린 보고도 표를 다시 세지 않는다', () => {
        const s = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        expect(s).toMatch(/if \(intelCountCache === null\) \{\s*intelCountCache = \(db\.prepare\("SELECT COUNT\(\*\) as count FROM intel"\)/);
        expect(s).toContain('intelCountCache += data.length;');
        expect(s).not.toContain('intelCountCache = null;');
    });
});
