# ⏱️ 1DAL 실시간 통신 시퀀스 다이어그램 (Sequence Diagrams)

> **문서 상태**: v2.0 (상세 확장판)  
> **목적**: 앱의 `HijackService`, 서버 라우터, 관제탑 소켓, DB 간의 엔드투엔드(E2E) 통신 흐름 상세 도해.

---

## 1. 1DAL E2E 생명주기 (Scrap -> Evaluate -> Piggyback)

앱에서 팝업을 열었을 때부터 관제탑을 거쳐 최종 터치(KEEP)가 집행되기까지의 흐름을 실제 호출되는 **함수명과 API 엔드포인트** 기준으로 그렸습니다.

```mermaid
sequenceDiagram
    participant App as Android (HijackService)
    participant Server as Node.js (routes/scrap)
    participant Eval as Node.js (OrderEvaluator)
    participant DB as SQLite (Repository)
    participant UI as React (Dashboard)

    %% 1. 파싱 및 심사 의뢰
    Note over App, Server: 1. 콜 발굴 및 심사 의뢰
    App->>Server: POST /confirm/detailed (오더 파싱 데이터 전송)
    Server-->>App: HTTP 202 Accepted
    
    %% 서버 심사 진행
    Server->>Eval: evaluate(order, session)
    Note over Eval: 플러그인(Insung) 정규화<br/>Kakao 지오코딩 / 라우팅<br/>PricingEngine 요금 계산
    Eval->>UI: [WebSocket] emit('order-evaluated', order)
    
    %% 관제탑 개입
    Note over UI: 관제사: "이건 꿀이네!"
    UI->>Server: [WebSocket] emit('dispatch-decision', { action: 'KEEP' })
    Note over Server: session.pendingDecisions 에 KEEP 저장
    
    %% 2. 피기백 통신
    Note over App, Server: 2. 강제 하트비트 및 피기백(Piggyback) 수신
    App->>Server: POST /api/scrap (isHolding: true)
    
    Note over Server: 큐에 대기 중인 KEEP 발견!
    Server-->>App: HTTP 200 OK + { decisions: [{ action: "KEEP" }] }
    
    Note over App: AutomationEngine.clickConfirmButton()<br/>안드로이드 화면 자동 터치 실행!
    
    %% 3. 상태 머신 전이 및 DB 저장
    Note over App, DB: 3. 터치 성공 보고 및 백엔드 상태 전진
    App->>Server: POST /api/scrap (화면 변경 보고: LIST)
    
    Note over Server: StateMachine.advanceOnKeep() 실행<br/>STANDBY ➡️ GATHERING 전환
    
    Server->>DB: OrderRepository.upsertOrder(order)
    Server->>DB: PlaceRepository.upsertPlace(pickup, dropoff)
    
    Server->>UI: [WebSocket] emit('order-confirmed')
    Server->>UI: [WebSocket] emit('filter-updated', GATHERING 모드)
```
