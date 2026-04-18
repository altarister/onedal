# 1DAL 다중 사용자 인증(Auth) 및 카카오 내비 개인화 구현 계획

웹(React) 및 향후 전환될 모바일 앱(React Native) 환경을 모두 커버할 수 있는 Google Login 도입과 사용자별 톨게이트/차종 정보를 카카오 API에 주입하기 위한 아키텍처 설계안입니다. 

## User Review Required
> [!IMPORTANT]
> 본 계획서는 실제 서버 코드를 작성하기 앞서 확정해야 할 **데이터베이스 구조**와 **인증 흐름**에 대한 종합 완성 설계입니다.
> 
> 설계안을 확인하시고 승인해주시면, 백엔드 로그인(JWT) 모듈 개발과 데이터베이스 초기화(기능) 개발에 바로 돌입하겠습니다.

---

## 1. 인증(Auth) 아키텍처: JWT 기반 무상태(Stateless) 시스템

모바일 환경(앱) 및 크로스 도메인 이슈를 완벽 방어하기 위해 **JWT(JSON Web Token) 및 Refresh Token 전략**을 도입합니다.

### 1-1. 토큰 발급/갱신 흐름 (Cross-Platform)
1. **Frontend (웹/앱)**: 사용자 구글 로그인 클릭 -> 구글 서버로부터 `credential(id_token)` 획득.
2. **Backend 통신**: Frontend가 획득한 토큰을 백엔드의 `POST /api/auth/google`로 전송.
3. **Backend 검증 및 발급**: Node.js 서버에서 `google-auth-library`로 위조 검증. 검증 완료 시 DB 회원가입/조회 후 **Access Token**(수명 짧음, e.g., 1시간)과 **Refresh Token**(수명 김, e.g., 14일) 1세트를 자체 발급하여 반환.
4. **갱신 전략**: Access Token 만료 시 Frontend가 뒤에서 조용히 `POST /api/auth/refresh`를 찔러 토큰을 자동 갱신(Auto Login 유지).

### 1-2. Socket.io 보안 핸드셰이크 (핵심 방어)
REST API 뿐만 아니라 **핵심 배차 로직이 오가는 Socket.io 채널**에도 JWT 인증 미들웨어를 붙입니다.
- 소켓 연결(`io.use`) 시 헤더의 토큰을 검사하여, 인증되지 않은 소켓은 관제 데이터 수신 및 콜 판결(`KEEP/CANCEL`) 접근을 원천 차단합니다.

---

## 2. 데이터베이스 스키마 설계 (SQLite)

### 2-1. `users` 테이블 (기본 회원 및 권한 정보)
어드민(Admin)과 일반 사용자(User) 등급을 구분하여 관제/일반 기능을 분리합니다.

```sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,         
    google_id TEXT UNIQUE,       
    email TEXT UNIQUE,           
    name TEXT,                   
    avatar TEXT,                 
    role TEXT DEFAULT 'USER',    -- 'ADMIN' 또는 'USER' 권한
    created_at TEXT              
)
```

### 2-2. `user_devices` 테이블 (폰-유저 페어링 및 기기 매핑)
기사님 1명이 다수의 단말기(안드로이드 파서 폰)를 사용할 수 있도록 설계합니다.
**기기 등급 흐름**: 대시보드(웹)에서 로그인 후 "기기 페어링(QR 또는 단축 코드)"을 통해 폰의 `deviceId`를 본인 계정에 귀속시킵니다. 이후 폰에서 올라오는 스크랩은 전부 해당 유저의 운행 일지로 기록됩니다.

```sql
CREATE TABLE IF NOT EXISTS user_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,       
    device_id TEXT NOT NULL,     -- 앱폰 고유 ID (ex: '앱폰-sdk_gpho-160')
    device_name TEXT,            -- 기기 별명 (ex: '업무용 서브폰')
    registered_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, device_id)
)
```

### 2-3. `user_settings` 테이블 (기사 맞춤형 라우팅/연비 설정)
기사님들마다 본인의 차종, 선호 경로, **단가 산정(연비) 기준**을 다르게 두어 1:1 관계로 관리합니다. 카카오 파라미터를 100% 반영합니다.

```sql
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,    
    -- [차량 정보] 
    car_type INTEGER DEFAULT 1,      -- 카카오 API 차종 (1: 승용/소형화물, 2: 중형화물 ...)
    car_fuel TEXT DEFAULT 'GASOLINE',-- 카카오 API 유종 ('GASOLINE', 'DIESEL', 'LPG')
    
    -- [수익/단가 산정용 연비 데이터 추가]
    car_hipass BOOLEAN DEFAULT 1,    -- 하이패스 장착 여부 (통행료 할인용)
    fuel_price INTEGER DEFAULT 1600, -- 리터당 유류 단가 (원)
    fuel_efficiency REAL DEFAULT 10.0, -- 연비 (km/L)
    
    -- [경로 선호 옵션] 
    default_priority TEXT DEFAULT 'RECOMMEND', 
    avoid_toll BOOLEAN DEFAULT 0,              
    dispatch_auto_accept BOOLEAN DEFAULT 0,    
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

### 2-4. `intel` 테이블 마이그레이션 (레거시 처리)
- **변경**: 스크랩 테이블(`intel`)에 `user_id` 컬럼 추가.
- **레거시 정책**: 이미 적재된 22,000여 건의 데이터는 `user_id = NULL` 로 두고, **"시스템 공용 훈련용/통계 빅데이터"**로만 간주하여 기사별 운행일지 통계에서는 제외합니다.

---

## 3. 권한 매트릭스 (ADMIN vs USER) 조율

단순 필터링 변경과 핵심 배차 제어에 대한 권한을 엄격하게 나눕니다.

| 기능 | ADMIN (관리자/통제실) | USER (일반 기사) |
|------|:-----:|:----:|
| 전체 기기 관제 현황 파악 (DeviceControlPanel) | ✅ 허용 | ❌ 불가 |
| 통합 콜 필터링 기준 변경 (OrderFilterModal) | ✅ 허용 | ❌ 불가 |
| 통합 배차 판결 (KEEP/CANCEL) | ✅ 허용 | ❌ 불가 |
| 본인 소속 기기(폰)의 스크랩/운행일지 열람 | ✅ 허용 | ✅ 허용 |
| 본인 차량 맞춤 설정 (user_settings) 조작 | ✅ 허용 | ✅ 허용 |
| 스크랩 수신 엔드포인트 (`POST /api/scrap`) 접근 | 기기(단말기) 고유 권한 | 기기(단말기) 고유 권한 |

---

## 4. UI 및 서버 연동 작업 목표 (수정 대상)

#### 1. Backend 로직 및 미들웨어
*   `db.ts`: 신규 테이블 3개 및 `intel` 스키마 마이그레이션.
*   `routes/auth.ts`: Google 인증 및 토큰 쌍(Access+Refresh) 발급 라우터 신설.
*   `middlewares/authMiddleware.ts`: JWT 파싱 및 Role 체크 가드(Guard) 작성.
*   `index.ts`: Socket.io Handshake(`io.use`) 인증 로직 부착.

#### 2. KakaoNav 라우팅 동적 주입
*   `routes/kakaoUtil.ts`: 하드코딩 된 `car_type` 및 상수들을 제거하고 `user_settings` 값을 주입받아 카카오 API 연비 통행료 정밀 타겟팅.
*   `routes/detail.ts`: 소켓 요청 시 `socket.data.user.id`로 세팅을 조회해 연산 주입.

#### 3. Frontend 인터페이스
*   `App.tsx`, `api/auth.ts`: 엑세스 토큰 인터셉터 장착 및 로그인 여부 라우팅 가드.
*   `pages/Login.tsx`, `pages/DevicePairing.tsx`: 깔끔한 로그인 폼 및 폰 연결(페어링) 폼 UI 구축.
*   `Dashboard` 상단: JWT에서 파싱한 기사 이름 및 차량 태그 전시.
