# ⚙️ 1DAL 서버 환경 변수 및 설정 파일 스펙 (Config Spec)

> **문서 상태**: v2.0 (상세 확장판)  
> **목적**: 인프라 구동을 위한 `.env` 환경 변수와 비즈니스 룰 하드코딩 매직 넘버(`dispatchConfig.ts`) 코드 명세.

---

## 1. `.env` (Environment Variables)

`.env` 파일은 소스코드(Git)에 포함되지 않으며, 서버를 가동하는 머신(Host)에 직접 생성해야 합니다. 백엔드가 부팅될 때 `src/config/env.ts` 모듈이 이 변수들의 유효성을 깐깐하게 검증(Zod 등 사용)하고 뻗어버릴지 계속 진행할지 결정합니다.

```env
# Server Base
PORT=3001
NODE_ENV=development

# Kakao Mobility API (필수)
KAKAO_REST_API_KEY=YOUR_KAKAO_API_KEY

# OSRM Fallback Server
OSRM_SERVER_URL=http://router.project-osrm.org
```

---

## 2. 하드코딩 설정 매직 넘버 (`dispatchConfig.ts`)

데이터베이스에 저장하기엔 모호하고 하드코딩으로 두기엔 여기저기 흩어질 '매직 넘버'들을 모아둔 파일입니다. 이 값을 조절하여 서버의 꿀콜/똥콜 심사 기준의 빡빡함을 전체적으로 조율할 수 있습니다.

```typescript
// src/config/dispatchConfig.ts

export const DISPATCH_CONFIG = {
    // ------------------------------------
    // 단독 주행 (STANDBY 모드) 심사 룰
    // ------------------------------------
    /** 단독 주행 시, 이 시간 이내로 도착하면 즉시 꿀콜 라벨 부여 (분) */
    SOLO_HONEY_TIME_MAX: 30,
    
    /** 단독 주행 시, 이 시간 이상 소요되면 패널티 사유로 등록 (분) */
    SOLO_SHIT_TIME_MIN: 60,


    // ------------------------------------
    // 우회 합짐 (GATHERING 모드) 심사 룰
    // ------------------------------------
    /** 합짐을 추가했을 때, 원래 목적지 도착 시간이 이 정도만 늦어지면 꿀 (분) */
    DETOUR_HONEY_TIME_MAX: 10,
    
    /** 합짐 때문에 도착 시간이 이 이상 지연되면 무조건 똥콜 방출 (분) */
    DETOUR_SHIT_TIME_MIN: 20,
    
    /** 합짐 때문에 원래 경로에서 벗어나는 킬로수가 이 이상이면 방출 (km) */
    DETOUR_SHIT_DIST_MIN: 6,


    // ------------------------------------
    // 시스템 제어 타임아웃
    // ------------------------------------
    /** 데스밸리: 기사가 팝업 상세 화면에 머무를 수 있는 최대 시간. 초과 시 강제 닫기 (ms) */
    DEATH_VALLEY_TIMEOUT_MS: 10000,
    
    /** 좀비 세션 클리너: 이 시간 동안 하트비트가 없으면 기기를 오프라인 처리 (ms) */
    ZOMBIE_SESSION_TIMEOUT_MS: 20000,
    
    /** DB Lock 재시도 간격 (ms) */
    SQLITE_BUSY_RETRY_INTERVAL_MS: 100
};
```
