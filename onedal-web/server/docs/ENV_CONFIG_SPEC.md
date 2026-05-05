# ⚙️ 1DAL 서버 환경 변수 및 설정 파일 스펙

> **문서 상태**: v3.0 (코드 동기화)  
> **SSOT 코드**: `.env`, [dispatchConfig.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/config/dispatchConfig.ts)

---

## 1. `.env` (Environment Variables)

```env
# Server Base
PORT=4000                          # ⚠️ v2.0에서는 3001로 적혀있었으나 실제는 4000
NODE_ENV=development

# Kakao Mobility API (필수)
KAKAO_REST_API_KEY=YOUR_KAKAO_API_KEY

# Google OAuth (인증용)
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET

# JWT (세션 토큰)
JWT_SECRET=YOUR_JWT_SECRET
JWT_REFRESH_SECRET=YOUR_JWT_REFRESH_SECRET

# DB
DB_FILE=local.db                   # 기본값. 테스트 시 test.db 등으로 변경 가능

# OSRM Fallback Server (선택)
OSRM_SERVER_URL=http://router.project-osrm.org
```

---

## 2. 매직 넘버 설정 (`dispatchConfig.ts`)

콜 판독 기준과 통신 타임아웃을 한 곳에 모아둔 파일입니다.

| 상수 | 현재 값 | 설명 |
|------|---------|------|
| `SOLO_HONEY_TIME_MAX` | 40분 | 단독 운행 이 시간 이하 → 꿀 |
| `SOLO_SHIT_TIME_MIN` | 90분 | 단독 운행 이 시간 이상 → 똥 |
| `DETOUR_HONEY_TIME_MAX` | 30분 | 합짐 추가 시간 이 분 이하 → 꿀 |
| `DETOUR_HONEY_DIST_MAX` | 15km | 합짐 추가 거리 이 km 이하 → 꿀 |
| `DETOUR_SHIT_TIME_MIN` | 60분 | 합짐 추가 시간 이 분 이상 → 똥 |
| `DETOUR_SHIT_DIST_MIN` | 30km | 합짐 추가 거리 이 km 이상 → 똥 |
| `WAITING_WARNING_MS` | 30000ms | 데스밸리 경고 타이머 |
| `WAITING_TIMEOUT_MS` | 35000ms | 데스밸리 강제 취소 타이머 |
