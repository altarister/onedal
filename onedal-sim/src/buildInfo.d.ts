/** 🧾 커밋 번호 — `buildInfoPlugin.ts` 가 싣는다 */
declare module 'virtual:build-info' {
    const info: {
        commit: string;
        /** onedal-sim 에 커밋 안 된 고침이 있다 */
        dirty: boolean;
        mode: 'dev' | 'build' | 'test';
    };
    export default info;
}
