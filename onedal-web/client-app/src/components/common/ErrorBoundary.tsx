import { Component, isValidElement, type ErrorInfo, type ReactNode } from 'react';

/**
 * 🔴 **한 컴포넌트가 터져도 관제탑 전체가 죽지는 않는다.**
 *
 * 에러 경계가 없으면 렌더 중 예외가 하나만 나도 React 가 트리 전체를 내려
 * **화면이 통째로 하얘진다** — 컴포넌트 하나의 오류로 관제탑 전부가 죽는다.
 *
 * 기사님이 운행 중이면 그 화면이 **KEEP/CANCEL 결재를 하는 유일한 창구**다.
 * 죽으면 잡아 둔 콜을 어떻게 할 방법이 없다 — 이건 안전 문제다.
 *
 * 🔴 **조용히 숨기지 않는다.** 규칙 ④ "빈 필터는 제한 없음이 아니라 고장이다" 와 같은 줄기다.
 *    무엇이 터졌는지 크게 적고, 되살릴 수단(다시 그리기 · 새로고침)을 함께 준다.
 *    콘솔에도 원래 예외를 그대로 남긴다 — 경계가 원인 추적을 가려서는 안 된다.
 */
interface Props {
    /** 어디가 터졌는지 기사님이 알아볼 이름 (예: "결재 카드") */
    label: string;
    children: ReactNode;
}
interface State {
    error: Error | null;
}

/** 두 자식(칸 하나)의 자료 칸이 다른가 — 함수 칸(누름 처리)은 그릴 때마다 새것이라 안 본다 */
function dataPropsChanged(prev: ReactNode, next: ReactNode): boolean {
    if (!isValidElement(prev) || !isValidElement(next) || prev.type !== next.type) return prev !== next;
    const a = prev.props as Record<string, unknown>, b = next.props as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        if (typeof a[k] === 'function' && typeof b[k] === 'function') continue;
        if (!Object.is(a[k], b[k])) return true;
    }
    return false;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    /** 마지막으로 콘솔에 남긴 오류 글 — 다시 그릴 때마다 같은 오류가 나도 한 줄만 */
    private lastLogged: string | null = null;

    componentDidCatch(error: Error, info: ErrorInfo) {
        // 🔴 삼키지 않는다. 원래 예외와 컴포넌트 스택을 그대로 남긴다 — 글이 바뀔 때만(바로 아래 다시 그리기가 같은 오류를 되풀이한다)
        if (error.message === this.lastLogged) return;
        this.lastLogged = error.message;
        console.error(`🚨 [화면 오류] ${this.props.label} 렌더링 실패`, error, info.componentStack);
    }

    /**
     * 🔁 **칸에 넘긴 자료가 바뀌면 빨간 상자를 풀고 한 번 다시 그린다** (기사님 «가»).
     * 운전 중에는 «다시 그리기»를 누를 수 없다 — 다음 소켓 갱신으로 자료가 바로잡히면 칸이 저절로 돌아온다.
     * 🔴 «자식이 새 객체인가»로 보지 않는다 — JSX 자식은 부모가 그릴 때마다 새 객체라, 그러면 같은 자료로도
     *    그릴 때마다 풀고 다시 터져 React 의 오류 줄이 서버 로그에 쌓인다. 자료 칸(함수가 아닌 값)이 바뀌었을 때만 푼다.
     *    자기 저장소에서 자료를 읽는 칸(넘긴 자료가 없음)은 «다시 그리기» · 접었다 펴기로 푼다.
     */
    componentDidUpdate(prevProps: Props) {
        if (this.state.error && dataPropsChanged(prevProps.children, this.props.children)) this.setState({ error: null });
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        /**
         * 훅 개수가 바뀐 직후의 핫 리로드 실패는 **코드 버그가 아니다** (개발 중에만 난다).
         * 원인이 뻔한데 "버그입니다"라고만 적으면 코드를 뒤지게 된다 — 그 경위는
         * `client-app/CLAUDE.md` 함정에 적어 뒀다. 여기서는 할 일을 알려 준다.
         */
        const isHotReload = import.meta.env.DEV && /Should have a queue|order of Hooks/.test(error.message);

        return (
            <div className="m-2 rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm">
                <div className="font-bold text-red-300">🚨 {this.props.label}을(를) 그리지 못했습니다</div>

                {isHotReload ? (
                    <p className="mt-2 text-red-200/80">
                        개발 중 <b>핫 리로드</b> 때문입니다 (코드 버그가 아닙니다).
                        <b> 새로고침(⌘+Shift+R)</b> 하면 사라집니다.
                    </p>
                ) : (
                    <p className="mt-2 text-red-200/80">
                        나머지 화면은 살아 있습니다. 다시 그려도 안 되면 새로고침해 주세요.
                    </p>
                )}

                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs text-red-200/60">
                    {error.message}
                </pre>

                <div className="mt-3 flex gap-2">
                    <button
                        className="rounded bg-red-600/80 px-3 py-1.5 font-medium text-white hover:bg-red-600"
                        onClick={() => this.setState({ error: null })}
                    >
                        다시 그리기
                    </button>
                    <button
                        className="rounded bg-slate-700 px-3 py-1.5 font-medium text-white hover:bg-slate-600"
                        onClick={() => window.location.reload()}
                    >
                        새로고침
                    </button>
                </div>
            </div>
        );
    }
}
