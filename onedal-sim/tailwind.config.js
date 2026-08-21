/** @type {import('tailwindcss').Config} */
// 화면은 앱(src/pages)과 패키지(packages/ui-simulators) 두 곳에 있다 — 둘 다 훑어야
// 클래스가 빠지지 않는다. 게임의 shadcn 테마·animate 플러그인은 시뮬레이터가 안 쓴다.
export default {
    content: [
        './index.html',
        './src/**/*.{ts,tsx,js,jsx}',
        './packages/ui-simulators/src/**/*.{ts,tsx,js,jsx}',
    ],
    theme: { extend: {} },
    plugins: [],
};
