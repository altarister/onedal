import router from '../../src/routes/logs';

/**
 * 📱 **원달앱 운행 기록을 받는 입구** — `POST /api/logs/app`
 *
 * 실물 픽커에서 수락한 뒤 원달앱이 모은 화면 글자 전문과 누른 버튼을 서버 로그 파일에 남긴다.
 * 퀵 화면을 만들 근거가 이 줄들이다 — 잘리면 09-13 로그처럼 «프로모션 4,000P 4,000»에서 끊겨 쓸 수가 없다.
 * 관제웹 줄(`🖥️ [관제웹 …]`)과 머리가 달라야 `grep` 한 번에 원달앱 줄만 뽑힌다.
 */
type Handler = (req: unknown, res: unknown) => void;
type Layer = { route?: { path: string; stack: { handle: Handler }[] } };
const handlerOf = (path: string): Handler => {
    const layer = (router as unknown as { stack: Layer[] }).stack.find(l => l.route?.path === path);
    if (!layer?.route) throw new Error(`${path} 입구가 없다`);
    return layer.route.stack[0].handle;
};

describe('📱 POST /api/logs/app — 원달앱 운행 기록', () => {
    let logs: string[];
    let spy: jest.SpyInstance;
    beforeEach(() => {
        logs = [];
        spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logs.push(args.join(' ')); });
    });
    afterEach(() => spy.mockRestore());

    const call = (body: unknown) => {
        const res = { json: jest.fn() };
        handlerOf('/app')({ body }, res);
        return res;
    };

    it('🔴 화면 글자를 자르지 않는다 — 수천 자 한 줄도 통째로 남는다', () => {
        const screen = '픽업지 정보 ' + '가'.repeat(5000) + ' 뒤로가기 배정 취소 픽업 출발하기';
        const res = call({ deviceId: '앱폰-SM-A245N-784', lines: [{ at: '11:55:15.756', msg: screen }] });
        expect(res.json).toHaveBeenCalledWith({ ok: true, received: 1 });
        const line = logs.find(l => l.startsWith('📱 [원달앱 앱폰-SM-A245N-784] 11:55:15.756 '));
        expect(line).toBeDefined();
        expect(line!.endsWith('픽업 출발하기')).toBe(true);
    });

    it('줄바꿈은 한 줄로 편다 — grep 한 번에 잡히게', () => {
        call({ deviceId: 'a', lines: [{ at: '12:00:00.000', msg: '첫 줄\n둘째 줄' }] });
        expect(logs).toEqual(['📱 [원달앱 a] 12:00:00.000 첫 줄 둘째 줄']);
    });

    it('관제웹 줄과 머리가 다르다 — 원달앱 줄은 🖥️ 로 시작하지 않는다', () => {
        call({ deviceId: 'a', lines: [{ at: '12:00:00.000', msg: '👆 [누름] «픽업 출발하기»' }] });
        expect(logs.length).toBe(1);
        expect(logs[0].startsWith('🖥️')).toBe(false);
    });

    it('빈 요청이면 아무것도 안 찍고 받았다고만 답한다', () => {
        const res = call({ deviceId: 'a' });
        expect(res.json).toHaveBeenCalledWith({ ok: true, received: 0 });
        expect(logs).toEqual([]);
    });
});
