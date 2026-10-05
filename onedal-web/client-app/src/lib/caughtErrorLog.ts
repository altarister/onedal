/**
 * 🚨 **경계(ErrorBoundary)가 잡은 오류를 React 가 찍는 자리 — 같은 오류는 한 번만**.
 *
 * React 19 는 경계가 오류를 잡을 때마다 콘솔에 따로 찍는다(`createRoot` 의 `onCaughtError` 기본값).
 * 경계는 칸에 넘긴 자료가 바뀌면 한 번 다시 그려 보는데, 서버 동기화가 콜 목록을 새 배열로 보내므로
 * 고장 난 칸은 동기화마다 다시 터진다 — 그대로 두면 관제웹 콘솔(installConsoleCapture 가 서버로 올림)에 같은 줄이 쌓인다.
 * 그래서 오류 글로 한 번만 찍는다. 칸 이름은 경계(componentDidCatch)가 따로 한 번 찍는다.
 */
export function onceByMessage(log: (...args: unknown[]) => void) {
    const seen = new Set<string>();
    return (error: unknown, info?: { componentStack?: string }) => {
        const message = error instanceof Error ? error.message : String(error);
        if (seen.has(message)) return;
        seen.add(message);
        log('🚨 [화면 오류 · 경계가 받음]', error, info?.componentStack ?? '');
    };
}
