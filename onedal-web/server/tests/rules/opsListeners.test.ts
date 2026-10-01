import { createListeners } from '../../../ops/src/api/listeners';

/** 🔔 듣는 함수 묶음 — 부품 둘이 듣다가 하나가 닫혀도 다른 하나는 계속 받는다 (ab 교차 리뷰 — `listeners.clear()` 가 남의 듣기까지 지웠다) */
describe('🔔 운영센터 듣기 묶음', () => {
    it('🔴 하나가 닫혀도 다른 하나는 계속 받는다', () => {
        const l = createListeners();
        let a = 0, b = 0;
        const offA = l.add(() => a++);
        l.add(() => b++);
        l.notify();
        offA();
        l.notify(); l.notify();
        expect(a).toBe(1);
        expect(b).toBe(3);
        expect(l.size).toBe(1);
    });

    it('같은 듣기를 두 번 닫아도 남은 듣기는 그대로다', () => {
        const l = createListeners();
        let b = 0;
        const offA = l.add(() => {});
        l.add(() => b++);
        offA(); offA();
        l.notify();
        expect(b).toBe(1);
    });
});
