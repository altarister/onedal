# 1DAL SaaS 전환 (Multi-Tenant) 및 개인화 구현 계획

기존의 "1대의 스마트폰 + 중앙 관제" 형태를 넘어, **다수의 기사(User)들이 각자의 스마트폰과 필터 설정을 가지고 독립적으로 동작하며, 관리자(Admin)가 이를 총괄하는 진정한 SaaS(Software as a Service) 형태**로 확장하기 위한 마스터플랜입니다.

## User Review Required
> [!IMPORTANT]
> 본 계획서는 프로젝트를 개인용 매크로에서 **다중 운수 종사자 플랫폼**으로 진화시키는 가장 거대한 설계 구조 변경안입니다. 
> 
> 설계안을 확인하시고 승인해주시면, 백엔드 로그인(JWT) 모듈과 다중 사용자 데이터베이스(SQLite) 기반 구축 작업에 돌입하겠습니다.

---

## 1. 아키텍처 대전환: Multi-Tenant (다중 사용자 격리) 구조

가장 핵심적인 변화는 모든 상태값(필터, 수신 대기열, 오더 판결)이 **서버 전역(Global)에서 유저 개인(Per-User) 단위로 분리**된다는 점입니다.

### 1-1. 작동 패러다임의 변화
*   **과거 (중앙 관제형)**: 폰 1대가 모든 오더를 올리면, 서버의 유일한 전역 필터(`activeFilterConfig`)에 의해 꿀콜이 걸러지고 누구나 KEEP/CANCEL을 누름.
*   **미래 (개별 기사형 - SaaS)**: 기사 A와 기사 B가 가입합니다. 기사 A는 자신의 폰을 연동하고 '수원행' 필터를 켭니다. 기사 B는 자신의 폰을 연동하고 '서울행' 필터를 켭니다. 서버는 각 기사의 폰에서 올라온 데이터를 **기사 본인의 필터 기준**으로만 검사하여 본인의 화면에만 뿌려주고, **본인만 KEEP/CANCEL** 할 수 있습니다.

### 1-2. JWT + Socket.io 룸(Room) 기반 통신
서버는 수십 개의 웹 브라우저와 수십 대의 안드로이드 폰 소켓을 감당해야 합니다.
- JWT 인증을 거친 각 소켓 커넥션은 `socket.join(user_id)`를 통해 **본인의 프라이빗 룸**에 묶입니다.
- 기사 A의 폰에서 올라온 데이터는 `io.to('기사A_UID').emit(...)` 형태로만 뿌려져 완벽한 보안과 독립성을 보장합니다.

---

## 2. 데이터베이스 스키마 설계 (SQLite)

### 2-1. `users` & `user_devices` (회원 및 기기 매핑)
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

CREATE TABLE IF NOT EXISTS user_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,       
    device_id TEXT NOT NULL,     -- 앱폰 고유 ID (ex: '앱폰-sdk_gpho-160')
    device_name TEXT,            
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, device_id)
)
```

### 2-2. `user_settings` (기사별 라우팅 및 연비 개인화)
카카오 추천 기준 역시 사용자마다 차종/유종/톨게이트 선호도가 다르므로 개별 저장됩니다.
```sql
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,    
    car_type INTEGER DEFAULT 1,      
    car_fuel TEXT DEFAULT 'GASOLINE',
    car_hipass BOOLEAN DEFAULT 1,    
    fuel_price INTEGER DEFAULT 1600, 
    fuel_efficiency REAL DEFAULT 10.0, 
    default_priority TEXT DEFAULT 'RECOMMEND', 
    avoid_toll BOOLEAN DEFAULT 0,              
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

### 2-3. `user_filters` [NEW] (기사별 오더 사냥 필터)
**기존에 전역 메모리(`activeFilterConfig`)에 있던 필터를 DB화 시킵니다.**
기사마다 거주지가 다르고 목적지가 다르므로 필터 조건이 1:1로 저장되어야 합니다.
```sql
CREATE TABLE IF NOT EXISTS user_filters (
    user_id TEXT PRIMARY KEY,    
    destination_city TEXT,       
    destination_radius_km INTEGER DEFAULT 10,
    corridor_radius_km INTEGER DEFAULT 1,
    -- ... 기타 미니멈 단가, 시간 기준 등 기존 AutoDispatchFilter 속성 컬럼화
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

---

## 3. 권한 매트릭스 (ADMIN vs USER) 정의 명확화

사용자 기능과 어드민(플랫폼 운영자) 기능의 영역을 완전히 분리합니다.

| 기능 영역 | ADMIN (플랫폼 관리자 페이지) | USER (일반 기사 앱/웹) |
| :--- | :--- | :--- |
| **필터/오더 제어** | 개별 기사의 필터 및 배차에는 개입하지 않음 (조회만 가능) | **본인의 거주지/동선 기준 필터 개인화 (완전 제어)**<br>**자신에게 뜬 꿀콜 KEEP / CANCEL 수행** |
| **기기 관리** | 플랫폼에 연동된 폰 전체 로드 및 상태 이상 모니터링 | 본인 소유의 투폰, 쓰리폰 귀속(페어링) 및 해제 |
| **라우팅 / 수익**| 전체 시스템의 API 호출량 및 부하 모니터링 | 본인 차량(차종, 연비)에 특화된 카카오 경로/정산 |
| **운행 일지(Intel)**| 전체 기사들이 긁어 모은 `intel` 빅데이터 통계 및 열람 | 본인의 폰들이 스크랩한 내역 및 배차된 콜 일지 열람 |
| **사용자 관리** | 신규 가입자 승인, 이용 정지 조치, 권한 변경 | 본인 프로필 조회 및 구글 연동 |

> **💡 어드민 전용 페이지 신설안**: 
> 추후 일반 기사들이 접속하는 `Dashboard` 외에, `/admin/` 라우트를 만들어 어드민 전용 사용자 현황판(User Activity & Billing) 인터페이스를 별도로 구축할 수 있습니다.

---

## 4. UI 및 서버 연동 작업 목표 (수정 대상)

#### 1. Backend: 인프라의 다형성 확장
*   `db.ts`: 신규 테이블 4개(`users, user_devices, user_settings, user_filters`) 생성.
*   `routes/auth.ts`: Google 인증 및 토큰 쌍(Access+Refresh) 발급 신설.
*   `routes/detail.ts` & `orders.ts`: 소켓 통신을 전역 브로드캐스트(`io.emit`)에서 **유저 전용 룸 브로드캐스트(`io.to(userId).emit`)**로 전면 전환. 필터링 판독 및 `mainCallState` 등의 메모리를 **Map<userId, UserState>** 형태로 확장하여 스레드 충돌 방지.
*   `index.ts`: Socket.io Handshake 인증 및 방(Room) 입장 로직 구현.

#### 2. KakaoNav: 연비 정밀 계산 주입
*   `routes/kakaoUtil.ts`: 하드코딩 된 `car_type`과 통행료를 기사의 DB 세팅값(하이패스 장착 여부, 연비 등)으로 치환 호출.

#### 3. Frontend: 인증 및 데이터 소스 연결
*   `App.tsx`, `api/auth.ts`: 엑세스 토큰 자동 탑재 기반 마련.
*   `pages/Login.tsx`: 구글 소셜 로그인 / 인증 UI.
*   `OrderFilterModal.tsx`: 저장 및 호출 대상을 로컬 전역 스토어가 아닌, 백엔드 사용자 개별 필터 API로 변경.
