import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 🔴 **한 컴포넌트가 터져도 관제탑 전체가 죽지는 않는다.**
 *
 * 2026-08-14 까지 이 레포에 에러 경계가 **하나도 없었다.** 렌더 중 예외가 하나만 나도
 * React 가 트리 전체를 걷어내 **화면이 통째로 하얘진다.**
 * 실제로 `PinnedRoute` 하나가 터졌을 때 관제탑 전부가 죽었다.
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

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // 🔴 삼키지 않는다. 원래 예외와 컴포넌트 스택을 그대로 남긴다
        console.error(`🚨 [화면 오류] ${this.props.label} 렌더링 실패`, error, info.componentStack);
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
