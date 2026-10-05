import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * 🛡️ **한 칸이 터져도 그 칸만** — 관제 화면의 큰 칸은 각자 오류 경계 안에 있고, 앱 전체도 바깥 경계 안에 있다.
 * 노드 그리기(renderToStaticMarkup)는 경계가 예외를 받지 않으므로, 받은 뒤의 모양은 경계를 직접 불러 보고
 * 큰 칸이 경계 안에 있는지는 그 칸을 그리는 파일의 글자로 본다. 칸이 그려지는지는 regionsRender 검사가 본다.
 */
const src = (p: string) => readFileSync(join(__dirname, p), 'utf8');

/** `<Tag` 가 `<ErrorBoundary` 안(닫히기 전)에 있나 */
const insideBoundary = (text: string, tag: string) => {
    const at = text.indexOf(`<${tag}`);
    if (at < 0) return false;
    const before = text.slice(0, at);
    return before.lastIndexOf('<ErrorBoundary') > before.lastIndexOf('</ErrorBoundary>');
};

describe('오류 경계', () => {
    it('받으면 그 칸 이름 · 원래 오류 · 다시 그리기 · 새로고침을 그린다 — 조용히 숨기지 않는다', () => {
        expect(ErrorBoundary.getDerivedStateFromError(new Error('뭔가 터짐'))).toEqual({ error: new Error('뭔가 터짐') });
        const b = new ErrorBoundary({ label: '머리줄', children: null });
        b.state = { error: new Error('뭔가 터짐') };
        const html = renderToStaticMarkup(b.render() as JSX.Element);
        for (const text of ['머리줄을(를) 그리지 못했습니다', '뭔가 터짐', '다시 그리기', '새로고침']) expect(html).toContain(text);
    });

    it('칸에 넘긴 자료가 바뀌면 빨간 상자가 풀려 한 번 다시 그린다 — 운전 중에는 «다시 그리기»를 못 누른다', () => {
        const Cell = (_: { orders: unknown[]; onClose: () => void }) => null;
        const sameOrders: unknown[] = [];
        const b = new ErrorBoundary({ label: '서랍', children: <Cell orders={sameOrders} onClose={() => {}} /> });
        b.state = { error: new Error('뭔가 터짐') };
        const calls: unknown[] = [];
        b.setState = ((s: unknown) => { calls.push(s); }) as any;
        /* 부모가 같은 자료로 다시 그림 — 자식 객체 · 함수 칸은 새것이어도 자료가 같으면 풀지 않는다(풀면 그릴 때마다 터져 로그가 쌓인다) */
        b.componentDidUpdate({ label: '서랍', children: <Cell orders={sameOrders} onClose={() => {}} /> });
        expect(calls).toEqual([]);
        /* 새 자료 — 풀고 다시 그린다 */
        b.componentDidUpdate({ label: '서랍', children: <Cell orders={[]} onClose={() => {}} /> });
        expect(calls).toEqual([{ error: null }]);
    });

    it('같은 오류가 되풀이되면 콘솔 줄은 한 번만 — 다시 그릴 때마다 찍지 않는다', () => {
        const logged: unknown[] = [];
        const orig = console.error;
        console.error = (...a: unknown[]) => { logged.push(a[0]); };
        try {
            const b = new ErrorBoundary({ label: '머리줄', children: null });
            b.componentDidCatch(new Error('같은 오류'), { componentStack: '' } as any);
            b.componentDidCatch(new Error('같은 오류'), { componentStack: '' } as any);
            b.componentDidCatch(new Error('다른 오류'), { componentStack: '' } as any);
            expect(logged.length).toBe(2);
        } finally { console.error = orig; }
    });

    it('오류가 없으면 자식을 그대로 그린다 — 칸 배치가 바뀌지 않는다', () => {
        expect(renderToStaticMarkup(<ErrorBoundary label="x"><b>칸</b></ErrorBoundary>)).toBe('<b>칸</b>');
    });

    it('관제 화면의 큰 칸은 모두 경계 안에 있다 — 결재 카드 밖에서 터져도 결재 카드는 산다', () => {
        const dash = src('../../pages/Dashboard.tsx');
        for (const tag of ['Header', 'Drawer', 'DeviceControlPanel', 'MorningCard', 'OrderFilterStatus', 'OrderFilterModal', 'CargoMismatchBanner', 'StageView', 'StatusBoard'])
            expect(insideBoundary(dash, tag), tag).toBe(true);
        /* 알림 띠(GPS 알림 · 복구 · 오래된 콜 · 처리 실패)는 칸 부품 없이 Dashboard 가 바로 그린다 — 한 경계로 묶는다 */
        expect(dash).toContain('<ErrorBoundary label="알림 띠">');
    });

    it('앱 전체도 바깥 경계 안에 있다 — 큰 칸 밖에서 터지면 하얀 화면 대신 빨간 상자', () => {
        const app = src('../../App.tsx');
        expect(insideBoundary(app.slice(app.indexOf('export default function App')), 'Routes')).toBe(true);
    });
});
