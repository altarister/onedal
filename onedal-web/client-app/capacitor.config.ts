import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kr.co.onedal.dashboard',
  appName: '1DAL',
  webDir: 'dist',

  // 안드로이드 네이티브 설정
  android: {
    /**
     * 🔴 **로컬 서버(http)를 보려면 켜야 한다** (기사님 실측 2026-08-25).
     *
     * 기사님: *"관제앱에서 로컬로 실행하면 로그인을 못하던데."*
     *
     * 앱은 **`https://localhost`** 에서 자기 번들을 띄운다. 그 화면에서 로컬 서버
     * **`http://172.30.1.58:4000`** 를 부르면 웹뷰가 «혼합 콘텐츠»로 막는다:
     *
     *     E/Capacitor/Console: Mixed Content: The page at 'https://localhost/…'
     *
     * 라이브(`https://1dal.altari.com`)는 https 라 안 걸린다 — **로컬에서만** 난다.
     * 볼륨 업으로 서버를 고를 수 있게 만든 이상 이 길도 열려 있어야 한다.
     *
     * ⚠️ 이건 **개발 편의**를 위한 완화다. 실사용은 라이브(https)이므로 노출이 늘지 않는다.
     */
    allowMixedContent: true,
  },

  server: {
    cleartext: true, // 로컬 HTTP 서버(172.30.x.x) 접근 허용
  },

  plugins: {
    // 화면 꺼짐 방지 (운전 중 대시보드 항상 켜짐)
    KeepAwake: {
      // 앱 시작 시 자동으로 Keep-Awake 활성화
    },
  },
};

export default config;
