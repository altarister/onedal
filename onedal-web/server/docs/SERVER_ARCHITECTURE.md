# 🏛️ 1DAL 백엔드 서버 아키텍처 명세 (Node.js)

본 문서는 리팩토링된 1DAL 백엔드 서버의 전체 구조와 핵심 파이프라인, 그리고 폴더 스펙을 정의합니다. `dispatchEngine.ts` (God Object) 해체 이후 새롭게 정립된 **단일 책임 원칙(SRP)** 및 **플러그인 아키텍처**를 기반으로 작성되었습니다.

---

## 1. 전체 시스템 아키텍처 개요

안드로이드 앱에서 수집된 스크래핑 데이터는 라우터를 거쳐 백엔드 핵심 엔진인 `OrderEvaluator`로 전달됩니다. 평가는 **플러그인, 요율 엔진, 라우팅 알고리즘**의 도움을 받아 처리되며, 최종 결과는 `StateMachine`을 통해 세션 상태에 반영된 후 피기백(Piggyback) 프로토콜로 앱에 반환됩니다.

```mermaid
graph TD
    subgraph "Android App"
        A[스크래핑 데이터 발송] -->|POST /api/scrap| B(routes/scrap.ts)
    end

    subgraph "Backend Core Pipeline"
        B -->|1. 데이터 전달| C{OrderEvaluator<br/>(콜 심사 엔진)}
        
        C -->|2. 앱별 규칙 호출| P[plugins/IAppPlugin]
        P -.-> P1(InsungPlugin)
        P -.-> P2(Hwamul24Plugin)

        C -->|3. 거리/소요시간 연산| S1(kakaoService / osrmUtil)
        C -->|4. 동적 요율 연산| S2(PricingEngine)

        C -->|5. 종합 결과 반환| D[StateMachine<br/>(상태 관리 엔진)]
    end

    subgraph "Data Access & React Dashboard"
        D -->|6. 영구 저장| DB[(SQLite DB<br/>Repositories)]
        D -->|7. 실시간 동기화| SC((Socket.io))
        SC -->|WebSocket| UI[React Dashboard]
    end

    subgraph "Piggyback Response"
        D -->|8. 판결/필터 탑재| E[HTTP 200 ACK 응답]
        E -->|Return to App| A
    end

    classDef core fill:#e3f2fd,stroke:#1565c0,stroke-width:2px;
    classDef plugin fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;
    classDef route fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    class C,D,S2 core;
    class P,P1,P2 plugin;
    class B,E route;
```

---

## 2. 폴더 및 모듈 스펙 (Directory Structure)

리팩토링 이후의 `/server/src` 디렉토리는 다음과 같이 구성됩니다.

```text
server/src/
├── core/                        # 백엔드 핵심 비즈니스 로직
│   ├── engine/                  # 분리된 도메인 엔진 (순수 로직)
│   │   ├── OrderEvaluator.ts    # 필터 검증 -> 카카오 연산 -> 꿀/똥 판독 파이프라인
│   │   ├── PricingEngine.ts     # 차종별 단가, 수수료, 마진율 계산기
│   │   ├── StateMachine.ts      # 합짐 페이즈(STANDBY -> GATHERING) 전이 및 메모리 관리
│   │   └── RouteManager.ts      # 서버 재시작 시 궤적 복구 및 경로 재탐색 총괄
│   └── plugins/                 # 다중 앱 지원을 위한 어댑터 패턴 적용
│       ├── IAppPlugin.ts        # 인터페이스 명세
│       ├── insung/              # 인성콜 전용 정규화 및 필터 규칙
│       └── hwamul24/            # 화물24 전용 정규화 및 필터 규칙
│
├── repositories/                # 데이터베이스 접근 계층 (DAL)
│   ├── OrderRepository.ts       # orders 테이블 CRUD
│   └── PlaceRepository.ts       # places, orderStops 테이블 UPSERT
│
├── routes/                      # Express 라우터 (HTTP 인터페이스)
│   ├── scrap.ts                 # 하트비트 및 텔레메트리 수신 (피기백 반환)
│   ├── confirm.ts               # BASIC / DETAILED 결재 수신
│   └── devices.ts               # 기기 정보 및 설정
│
├── services/                    # 외부 시스템 연동 및 인프라 서비스
│   ├── kakaoService.ts          # 카카오 모빌리티 API 및 TSP(optimizeWaypoints) 연동
│   └── geoService.ts            # 회랑(Corridor) 추출 지리 정보 서비스
│
├── state/                       # 글로벌 인메모리 상태 스토어
│   └── userSessionStore.ts      # 유저별 활성 콜 및 필터 메모리 상태
│
└── utils/                       # 유틸리티 함수 (로거, 날짜 등)
```

---

## 3. 계층별 단일 책임 원칙 (SRP) 명세

리팩토링된 백엔드는 다음과 같은 **엄격한 규칙**을 따릅니다.

1. **Routes (`/routes`)**
   - HTTP 요청의 `req.body` 유효성을 검사합니다.
   - 비즈니스 로직을 직접 수행하지 않고 `core/engine` 에처리를 위임합니다.
   - 엔진의 결과를 받아 HTTP `res.json()` 또는 소켓 이벤트를 발생시킵니다.

2. **Core Engines (`/core/engine`)**
   - **DB 쿼리(`db.prepare`)를 직접 호출하지 않습니다.** 반드시 `repositories`를 통해 데이터를 입출력합니다.
   - 외부 API 주소를 직접 호출하지 않고 `services` (예: `kakaoService`)를 통해 데이터를 받아옵니다.
   - 순수 연산(예: `PricingEngine`)은 부수 효과(Side-effect) 없이 결과만 반환해야 테스트하기 쉽습니다.

3. **Repositories (`/repositories`)**
   - 오직 SQLite DB 쿼리 문법만 존재합니다.
   - 비즈니스 로직(예: 똥콜 여부 판단)이 이곳에 섞여선 안 됩니다. 
   - `INSERT`, `UPDATE`, `UPSERT` 등의 기능 단위 함수만 제공합니다.

4. **Plugins (`/core/plugins`)**
   - 요청 헤더 또는 페이로드에 명시된 `targetApp`에 따라 동적으로 주입됩니다.
   - 장소 텍스트 정규화 규칙 (예: `(주)삼성` -> `삼성`)이 앱마다 다르므로 각 플러그인에서 독립적으로 처리합니다.

---

## 4. 백엔드 통신 생명주기 (Data Lifecycle)

1. 앱 ➡️ 서버: `POST /api/scrap` 으로 1.0초 단위로 오더 덩어리 전송
2. 서버 라우터: `OrderEvaluator`로 오더 목록 전달
3. 서버 엔진: `OrderEvaluator`가 카카오 연산 및 요율 계산 완료 후 장/단점 라벨링 (ORDER_AWAITING_DECISION 승격)
4. 소켓 통신: React 프론트엔드로 `order-evaluated` 이벤트 푸시
5. 관제사 개입: React 프론트엔드에서 결재(KEEP/CANCEL) 시 `StateMachine`에 판단 등록
6. 피기백 반환: 이어지는 다음 `POST /api/scrap`의 HTTP `200 OK` 응답 본문에 관제사 판단을 실어서(Piggyback) 앱으로 반환
