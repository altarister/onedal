# 1DAL 다중 사용자 인증(Auth) 및 카카오 내비 개인화 구현 계획

웹(React) 및 향후 전환될 모바일 앱(React Native) 환경을 모두 커버할 수 있는 Google Login 도입과 사용자별 톨게이트/차종 정보를 카카오 API에 주입하기 위한 아키텍처 설계안입니다.

## User Review Required
> [!IMPORTANT]
> 본 계획서는 실제 서버 코드를 작성하기 앞서 확정해야 할 **데이터베이스 구조**와 **인증 흐름**에 대한 설계입니다.
> 
> 가장 추천드리는 기술 스택은 **Frontend(구글 Token 발급) -> Backend(Google 검증 및 JWT 자체 발급)** 패턴입니다. 세션이나 쿠키 대신 JWT를 사용해야 향후 React Native 앱에서도 동일한 백엔드 API를 100% 재사용할 수 있습니다. 
> 
> 설계안을 확인하시고 승인해주시면, 백엔드 로그인 로직과 데이터베이스 초기화(기능) 개발에 바로 돌입하겠습니다.

---

## 1. 인증(Auth) 아키텍처: JWT (JSON Web Token) 도입

모바일 앱(React Native) 확장을 고려할 때 가장 안정적인 형태는 **JWT 기반의 무상태(Stateless) 아키텍처**입니다. 세션/쿠키 방식은 앱 환경(크로스 도메인, 웹뷰 통신 등)에서 제약이 많으므로 배제합니다.

### 기 로그인 방식 작동 흐름 (Cross-Platform 지원)
1. **Frontend (웹/앱)**: 사용자가 구글 로그인 버튼 클릭 -> 구글 서버로부터 `credential` 획득.
   - *Web*: `@react-oauth/google` 패키지 사용
   - *App(React Native)*: `@react-native-google-signin/google-signin` 패키지 사용
2. **Backend 통신**: Frontend가 획득한 토큰을 백엔드의 `/api/auth/google`로 POST 전송.
3. **Backend 검증**: Node.js 서버는 `google-auth-library`를 사용해 구글 공개키로 위조 여부를 검증.
4. **회원 가입/응답**: 첫 로그인 시 DB(`users`, `user_settings`)에 신규 등록. 서버는 고유의 인증용 `JWT Token`을 생성하여 반환.
5. **API 인가**: 이후 카카오 API를 부르는 모든 백엔드 요청 시, HTTP Header에 `Authorization: Bearer <JWT>`를 실어 보내면, 백엔드가 누구인지 알아차리고 해당 유저의 차량 세팅 값을 꺼내어 활용.

---

## 2. 데이터베이스 스키마 설계 (SQLite)

현재 `server/src/db.ts` 내에 사용자 정보를 관리할 신규 테이블 2개를 추가합니다.

### 2-1. `users` 테이블 (기본 회원 및 권한 정보)
어드민(Admin)과 일반 사용자(User) 등급을 구분하여 관제/일반 기능을 분리합니다.

```sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,         
    google_id TEXT UNIQUE,       
    email TEXT UNIQUE,           
    name TEXT,                   
    avatar TEXT,                 
    role TEXT DEFAULT 'USER',    -- 'ADMIN' 또는 'USER' 권한 (관제 기능 분리용)
    created_at TEXT              
)
```

### 2-2. `user_devices` 테이블 [NEW] (사용자 - 다중 기기 매핑)
기사님 한 분이 폰 여러 대(투폰, 쓰리폰 등)를 사용할 수 있으므로, 폰 고유 식별자(`deviceId`)를 사용자에게 1:N으로 연결합니다.
이를 통해 **"어떤 기사가 어떤 폰에서 올린 스크랩인가"**를 완벽하게 추적하고(운행일지 분류의 기초), 어드민은 이를 통합해서 볼 수 있게 됩니다.

```sql
CREATE TABLE IF NOT EXISTS user_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,       -- users 테이블의 id
    device_id TEXT NOT NULL,     -- 앱폰에서 보내는 고유 deviceId (ex: '앱폰-sdk_gpho-160')
    device_name TEXT,            -- 사용자가 지정한 기기 별명 (ex: '업무용 갤S23')
    registered_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, device_id)
)
```

### 2-3. `user_settings` 테이블 (기사 맞춤형 라우팅/차량 설정)

```sql
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,    
    car_type INTEGER DEFAULT 1,      -- 카카오 API 차종 (1: 승용/소형화물, 2: 중형화물 ...)
    car_fuel TEXT DEFAULT 'GASOLINE',-- 유종 ('GASOLINE', 'DIESEL', 'LPG')
    default_priority TEXT DEFAULT 'RECOMMEND', 
    avoid_toll BOOLEAN DEFAULT 0,              
    dispatch_auto_accept BOOLEAN DEFAULT 0,    
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

### 2-4. `intel` 테이블 (변경 예정)
추후 스크랩 테이블(`intel`) 컬럼에 `device_id` 나 `user_id`를 추가하여 어떤 기사의 운행(일지) 데이터인지 분리할 예정입니다. (이번 DB 공사에 포함시켜 컬럼을 추가해 둡니다.)

---

## 3. UI 및 서버 연동 계획 (제안 변경 사항)

### [수정 대상 파일 목록]

#### 1. Backend 구현 (인증 & DB)
*   `server/src/db.ts`: 신규 테이블(`users`, `user_settings`, `user_devices`) 생성 및 기존 `intel` 테이블에 `user_id` 컬럼 추가 마이그레이션.
*   `server/src/routes/auth.ts` **[NEW]**: 구글 로그인 검증 및 JWT 발급을 담당하는 신규 라우터.
*   `server/src/middlewares/authMiddleware.ts` **[NEW]**: 요청 헤더의 JWT 검증 및 `role` 체크 미들웨어.
*   `server/src/routes/detail.ts`: `req.user.id`로 DB에서 `user_settings`를 꺼내어 반영.

#### 2. KakaoNav API Payload 수정
*   `server/src/routes/kakaoUtil.ts`: 하드코딩 된 `car_type=1`을 제거하고 사용자 설정값 반영.

#### 3. Frontend 구현 (로그인 창 및 Dashboard 헤더)
*   `client/src/App.tsx`: JWT 토큰 보유 여부에 따라 `<Login />` 화면 또는 `<Dashboard />` 렌더링.
*   `client/src/pages/Login.tsx` **[NEW]**: `@react-oauth/google`을 활용한 심플한 구글 로그인 연동 버튼 페이지 개발.
*   `client/src/api/auth.ts` **[NEW]**: Axios 인터셉터 설정. 모든 서버 요청에 JWT 토큰 탑재.

---

## 4. 해결된 Open Questions 및 적용 방안

**[적용 1: GCP Key 획득]** 
*   **답변됨**: 이미 등록되어 있으시군요. 서버 환경 변수(`.env`)와 프론트엔드 `.env.local` 에 이 Key들을 추가하여 연동할 수 있도록 제가 "코드 작성" 시점에 가이드를 드리겠습니다.
*   *(GCP Console 👉 "API 및 서비스" 👉 "사용자 인증 정보" 👉 "OAuth 2.0 클라이언트 ID"에서 확인 가능합니다)*

**[적용 2: 어드민/사용자 분리 및 기기 매핑]**
*   **답변됨**: 설계에 반영 완료했습니다.
    1. 사용자에게 `role` 컬럼 추가(`ADMIN`, `USER`).
    2. 다중 폰 등록을 위한 `user_devices` 테이블 추가.
    3. 일반 `USER`는 `user_devices`에 등록된 본인 폰에서 올라온 콜과 운행일지만 보게 되고, `ADMIN`은 중앙 관제형으로 전체 콜을 감시 및 조작할 수 있는 아키텍처로 구현됩니다.
