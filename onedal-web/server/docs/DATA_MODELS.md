# 🧬 1DAL 백엔드 데이터 모델 명세서

> **문서 상태**: v2.0 (상세 확장판)  
> **목적**: 영구 저장소(SQLite) 스키마와 인메모리 세션 스토어의 완벽한 타입스크립트(TypeScript) 정의 및 구조 시각화.

---

## 1. 영구 저장소 (SQLite 스키마 v5)

백엔드는 `SQLite`를 사용하여 데이터를 기록합니다. 오더와 장소를 분리한 정규화 설계(v5 스키마)를 따릅니다.

### 1.1 `orders` 테이블
배차가 확정(KEEP)되어 기사님의 '내 퀵'으로 소유된 오더 정보입니다.

```sql
CREATE TABLE orders (
    id TEXT PRIMARY KEY,                 -- 콜 식별자 (예: '1DAL-12345')
    type TEXT,                           -- 'NEW_ORDER', 'MODIFIED'
    pickup TEXT,                         -- 상차지 원본 텍스트
    dropoff TEXT,                        -- 하차지 원본 텍스트
    fare INTEGER,                        -- 기사 운임 (수수료 제외)
    status TEXT,                         -- 'ORDER_CONFIRMED', 'ORDER_COMPLETED', 'ORDER_CANCELED' 등
    userId TEXT,                         -- 배차받은 기사의 ID
    capturedAt TEXT,                     -- 앱에서 최초 캡처된 시간 (ISO-8601)
    capturedDeviceId TEXT,               -- 스크랩한 기기의 Device ID
    vehicleType TEXT,                    -- 요구 차종 ('1t', '다마스')
    distanceKm REAL,                     -- 앱에서 파싱한 기본 거리
    totalDistanceKm REAL,                -- 카카오 연산 후 도출된 최종 거리
    totalDurationMin INTEGER,            -- 카카오 연산 후 도출된 소요 시간
    kakaoSoloDistanceKm REAL,            -- 단독 연산 거리
    kakaoSoloDurationMin INTEGER,        -- 단독 연산 소요시간
    kakaoTimeExt TEXT,                   -- UI에 표출할 카카오 평가 문자열 (예: '+5km, +15분 똥')
    isShared INTEGER DEFAULT 0,          -- 1: 합짐 모드로 수행됨, 0: 단독 수행
    isExpress INTEGER DEFAULT 0,         -- 1: 급송/긴급 콜, 0: 일반
    orderForm TEXT,                      -- 운행 형태 (왕복, 당일 등)
    detailMemo TEXT,                     -- 적요 사항
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 1.2 `places` 테이블 (마스터 장소)
장소를 중복 없이 관리하기 위해 상호명과 주소를 정규화하여 저장합니다.

```sql
CREATE TABLE places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    addressDetail TEXT,                  -- 상세 주소 ("경기 성남시 분당구 정자동 123")
    customerName TEXT,                   -- 화주/상호명 (플러그인에 의해 정규화됨)
    region TEXT,                         -- 시/군/구 (통계용)
    x REAL,                              -- 경도 (Kakao X)
    y REAL,                              -- 위도 (Kakao Y)
    phone1 TEXT,                         -- 대표 연락처
    visitCount INTEGER DEFAULT 1,        -- 기사님이 이곳에 방문한 총 횟수
    lastVisitedAt TEXT,                  -- 마지막 방문 시점
    UNIQUE(addressDetail, customerName)  -- 동일 주소+상호명 삽입 방지 (UPSERT 용)
);
```

### 1.3 `orderStops` 테이블 (오더 ↔ 장소 매핑)
오더 하나에 여러 장소(픽업, 경유, 하차)가 묶일 수 있도록 1:N 매핑을 수행합니다.

```sql
CREATE TABLE orderStops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId TEXT,                        -- FK -> orders.id
    placeId INTEGER,                     -- FK -> places.id
    stopType TEXT,                       -- 'pickup', 'dropoff', 'waypoint'
    customerNameSnapshot TEXT,           -- 오더 당시 불렸던 상호명 (스냅샷)
    phoneSnapshot TEXT,                  -- 오더 당시 연락처
    FOREIGN KEY(orderId) REFERENCES orders(id),
    FOREIGN KEY(placeId) REFERENCES places(id)
);
```

### 1.4 `geocode_cache` 테이블 (지오코딩 L1/L2 영구 캐시)
카카오 지오코딩 API 호출 비용 절감 및 속도 개선을 위한 좌표 정보 캐시 테이블입니다. **(Task 4)**

```sql
CREATE TABLE geocode_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rawQuery TEXT UNIQUE NOT NULL,       -- 검색 원본 문자열
    parentName TEXT,                     -- 상위 행정구역명 (intel 매핑용)
    x REAL NOT NULL,
    y REAL NOT NULL,
    hitCount INTEGER DEFAULT 1,
    createdAt TEXT,
    lastHitAt TEXT
);
```

---

## 2. 휘발성 인메모리 스토어 (`UserSessionStore.ts`)

서버 런타임에 유지되는 초고속 메모리 세션입니다. 

### 2.1 `UserSession` 메인 구조체
```typescript
// src/state/userSessionStore.ts

export interface UserSession {
    /** 1. 확정된 오더 리스트 (기사가 현재 수행 중인 콜) */
    myOrders: MyOrder[];

    /** 2. 심사 중이거나 뷰어(관제탑)에 떠 있는 오더들의 원본 (orderId -> Object) */
    pendingOrdersData: Map<string, PendingOrder>;

    /** 3. 안드로이드 앱의 스크랩을 제어하는 오토 스크래핑 필터 (State Machine) */
    activeFilter: AutoDispatchFilter;

    /** 4. 기사님의 마지막 GPS 위치 정보 (하트비트로 갱신됨) */
    driverLocation: { x: number; y: number } | null;

    /** 5. Piggyback 큐 (관제탑 결재를 앱으로 실어 보내기 위한 대기열) */
    pendingDecisions: Map<string, PiggybackAction>;

    /** 6. 타이머들 (Death Valley 타임아웃, 중복 방지 타임아웃 등) */
    activeTimers: Map<string, NodeJS.Timeout>;
}

export interface PiggybackAction {
    action: 'KEEP' | 'CANCEL';
}
```

### 2.2 `AutoDispatchFilter` (스캐너 제어 모듈)
안드로이드 앱의 행동 강령을 정의합니다. 백엔드의 `StateMachine` 모듈에 의해 조작됩니다.

```typescript
export interface AutoDispatchFilter {
    /** true: 스크랩 및 터치 엔진 가동, false: 스캔 정지 (수동 모드) */
    isActive: boolean;                   

    /** true: GATHERING/DRIVING (합짐), false: STANDBY (단독 콜 탐색) */
    isSharedMode: boolean;               

    /** 관제탑 3단계 페이즈 */
    dispatchPhase: 'STANDBY' | 'GATHERING' | 'DRIVING'; 

    /** 첫 짐 평가 시 기준이 되는 기사님의 마지노선 금액 */
    minFare: number;                     
    /** 잡지 말아야 할 금액 상한선 */
    maxFare: number;                     

    /** 허용하는 차량 리스트 (예: ['1t', '1.4t']) */
    allowedVehicleTypes: string[];       
    
    /** 제목이나 적요에 포함되면 무조건 거르는 키워드 (착불, 수거 등) */
    excludedKeywords: string[];          

    /** [핵심] 합짐 GATHERING 모드일 때만 적용되는 카카오 회랑(Corridor) 지역 타겟팅 키워드 */
    destinationKeywords: string[];       
}
```

### 2.3 `PendingOrder` (심사 중인 객체)
스크래퍼가 파싱한 데이터에 서버 엔진이 연산한 라벨링(`isRejected`, `reasons`, `pros`)이 덧붙은 객체입니다.

```typescript
export interface PendingOrder extends SecuredOrder {
    /** 똥콜 판정 여부 */
    isRejected?: boolean;
    
    /** 심사관이 발견한 단점 및 패널티 사유들 */
    reasons: string[];
    
    /** 심사관이 발견한 장점들 (꿀콜 사유) */
    approvalReasons: string[];
    
    /** 카카오 TSP API 연산 결과 문자열 (UI 노출용) */
    kakaoTimeExt?: string;
    
    /** 합짐에 추가되었을 때 늘어나는 순수 우회 시간과 거리 */
    detourTimePenaltyMin?: number;
    detourDistPenaltyKm?: number;
}
```

### 2.4 프론트엔드 V2 상태 모델 호환성 100% 보완 (Task 27)
백엔드에 `ORDER_CONFIRMED`, `ORDER_CANCELED` 등 V2 상태(`status`) 모델이 도입됨에 따라, 클라이언트(프론트엔드) 측에서 구 버전 및 V2 데이터 간의 호환성을 보장하기 위해 다음과 같은 타입 가드 및 옵셔널 체이닝 방어 로직이 전면 적용되었습니다.

```typescript
// 클라이언트 측 호환성 방어 로직 (예시)
const isOrderCompleted = (status?: string) => {
    // 옵셔널 체이닝 및 V1/V2 하위 호환성 체크
    if (!status) return false;
    return status.includes('completed') || status.includes('ORDER_COMPLETED');
};

const isActiveOrder = (status?: string) => {
    if (!status) return true; // 기본적으로 살아있는 콜로 간주
    return !status.includes('canceled') && !status.includes('ORDER_CANCELED');
};
```
