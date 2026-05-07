import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kr.co.onedal.dashboard',
  appName: '1DAL',
  webDir: 'dist',

  // 안드로이드 네이티브 설정
  android: {
    // 로컬 개발 시 서버 URL을 동적으로 연결 (프로덕션에서는 빌드된 정적 파일 사용)
    // allowMixedContent: true,
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
