/**
 * 📦 앱 배포 규격
 * 누가: 서버와 운영센터 · 관제웹이 함께 읽는다
 * 언제: APK 를 올리고 받을 때
 * 어디서: 운영센터 앱 배포 · 관제웹 앱 받기
 * 무엇을: 올리기 머리 칸 이름 등 규격을 정한다
 * 어떻게: 올리기는 본문이 파일이고, 받기는 짧은 열쇠 주소를 쓴다
 * 왜: 올리는 쪽과 받는 쪽의 칸이 어긋나지 않게 한다
 */
/**
 * 📦 **앱 배포 규격 — 한 곳** (서버 `core/releases` · 운영센터 앱 배포 쪽 · 관제웹 가입 «앱 받기»).
 * 올리기는 `POST /api/ops/releases` 에 APK 바이트를 그대로 흘려 보내고(본문 = 파일), 판 정보는 머리 칸에 싣는다.
 * 받기는 `POST /api/downloads/links` 가 10분짜리 열쇠 주소를 주고, 그 주소를 폰 브라우저가 연다(머리 칸을 못 실어서).
 */
export const RELEASE_UPLOAD_HEADERS = {
    app: 'x-release-app',
    versionCode: 'x-version-code',
    versionName: 'x-version-name',
    fileName: 'x-file-name',
} as const;

/** 받기 링크 한 줄 — 앱별 최신 판 */
export interface DownloadLink {
    app: 'scanner' | 'dashboard';
    versionName: string;
    versionCode: number;
    sizeBytes: number;
    sha256: string;
    /** `/api/downloads/<열쇠>` — 10분 동안 여러 번(내려받기 관리자가 두 번 부른다) */
    url: string;
}
