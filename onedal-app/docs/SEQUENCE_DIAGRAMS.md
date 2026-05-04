# 🔄 1DAL 시퀀스 다이어그램 모음

> **문서 상태**: v1.0  
> **작성일**: 2026-05-05  
> **목적**: 주요 사용 시나리오별 앱 ↔ 서버 ↔ 관제탑 간 통신 흐름을 시간순으로 시각화

---

## 1. AUTO 모드 — 정상 배차 시나리오 (꿀콜 광클 → 서핑 → KEEP)

```mermaid
sequenceDiagram
    participant 인성앱 as 인성앱 화면
    participant 1DAL as 1DAL 엔진<br/>(HijackService)
    participant 서버 as 1DAL 서버
    participant 관제탑 as 관제탑 웹

    Note over 인성앱,1DAL: [LIST 화면] 콜 리스트 스캔 중
    인성앱->>1DAL: 화면 변경 이벤트 (AccessibilityEvent)
    1DAL->>1DAL: 텍스트 파싱 → shouldClick() 필터 통과
    1DAL->>인성앱: fareNode 좌표 자동 터치 (광클!)
    Note over 1DAL: isAutoSessionActive = true

    Note over 인성앱,1DAL: [DETAIL_PRE_CONFIRM] 상세 화면 진입
    1DAL->>1DAL: 2차 필터 재검증 (shouldClick)
    1DAL->>서버: POST /api/orders/confirm (step: BASIC, matchType: AUTO)
    서버-->>1DAL: 200 OK (접수 확인)
    
    Note over 1DAL: 동명이동 검증 → 통과
    1DAL->>인성앱: "확정" 버튼 자동 터치

    Note over 인성앱,1DAL: [DETAIL_CONFIRMED] 확정 화면 진입
    Note over 1DAL: 팝업 서핑 시작 (SurfingState: IDLE)
    
    1DAL->>인성앱: "적요상세" 버튼 클릭
    인성앱-->>1DAL: POPUP_MEMO 감지
    1DAL->>1DAL: 적요 텍스트 수집 (accumulatedDetailText)
    1DAL->>인성앱: "닫기" 클릭
    
    1DAL->>인성앱: "출발지" 버튼 클릭
    인성앱-->>1DAL: POPUP_PICKUP 감지
    1DAL->>1DAL: 출발지 텍스트 수집
    1DAL->>인성앱: "닫기" 클릭
    
    1DAL->>인성앱: "도착지" 버튼 클릭
    인성앱-->>1DAL: POPUP_DROPOFF 감지
    1DAL->>1DAL: 도착지 텍스트 수집
    1DAL->>인성앱: "닫기" 클릭
    
    Note over 1DAL: SurfingState: DONE
    1DAL->>서버: POST /api/orders/detail (step: DETAILED)
    서버-->>1DAL: 202 Accepted
    Note over 1DAL: 데스밸리 타이머 시작 (30초)<br/>isWaitingDecision = true<br/>Piggyback 1초 폴링 가동

    1DAL->>서버: POST /api/scrap (1초 간격 Piggyback 폴링)
    서버->>관제탑: order-evaluating 소켓 이벤트
    관제탑->>서버: decision: KEEP
    서버-->>1DAL: scrap 응답에 decision: {orderId, action: "KEEP"} 탑재

    Note over 1DAL: 판결 수신! 데스밸리 해제
    1DAL->>인성앱: "닫기" 버튼 클릭 (KEEP = 배차 유지)
    Note over 1DAL: resetSessionState() → 다음 사냥 대기
```

---

## 2. MANUAL 모드 — 기사님 수동 클릭 시나리오

```mermaid
sequenceDiagram
    participant 기사님
    participant 인성앱 as 인성앱 화면
    participant 1DAL as 1DAL 엔진
    participant 서버 as 1DAL 서버
    participant 관제탑 as 관제탑 웹

    Note over 인성앱,1DAL: [LIST 화면] 기사님이 직접 콜 리스트 탐색
    1DAL->>서버: POST /api/scrap (텔레메트리 보고만)
    
    기사님->>인성앱: 콜 터치 (수동 선택)
    
    Note over 인성앱,1DAL: [DETAIL_PRE_CONFIRM] 진입
    1DAL->>1DAL: 캐시 매칭 (recentListOrders에서 fare 역추적)
    1DAL->>서버: POST /confirm (matchType: MANUAL)
    서버-->>1DAL: 200 OK

    Note over 1DAL: isAutoSessionActive = false<br/>데스밸리 타이머 시작 안 함
    
    기사님->>인성앱: "확정" 직접 클릭
    Note over 인성앱,1DAL: [DETAIL_CONFIRMED] 진입 → 팝업 서핑 동일
    
    1DAL->>서버: POST /detail (matchType: MANUAL)
    서버->>관제탑: order-evaluating 소켓 이벤트
    
    Note over 관제탑: 관제탑에서 분석 후 KEEP/CANCEL 결정
    관제탑->>서버: decision 전송
    서버-->>1DAL: scrap Piggyback으로 판결 전달
    
    Note over 1DAL: MANUAL이므로 화면 터치 없음<br/>기사님이 직접 판단
```

---

## 3. 데스밸리 타임아웃 — 비상 취소 시나리오

```mermaid
sequenceDiagram
    participant 1DAL as 1DAL 엔진
    participant 서버 as 1DAL 서버
    participant 인성앱 as 인성앱 화면

    1DAL->>서버: POST /detail (AUTO 모드)
    서버-->>1DAL: 202 Accepted
    Note over 1DAL: ⏳ 데스밸리 타이머 시작 (30초)

    loop 1초 간격 Piggyback 폴링
        1DAL->>서버: POST /scrap
        서버-->>1DAL: decision = null (아직 판결 없음)
    end

    Note over 1DAL: ⏰ 30초 경과! 타임아웃!
    
    1DAL->>서버: POST /api/emergency<br/>(reason: AUTO_CANCEL)
    1DAL->>1DAL: executeDecisionImmediately("CANCEL")
    
    Note over 1DAL: 500ms 대기 후...
    1DAL->>인성앱: "취소" 버튼 자동 클릭
    Note over 1DAL: resetSessionState() → 사냥 복귀
```

---

## 4. 동명이동 3단계 검증 시퀀스

```mermaid
sequenceDiagram
    participant 1DAL as 1DAL 엔진
    participant 인성앱 as 인성앱 화면

    Note over 1DAL: AUTO 모드에서 꿀콜 발견!
    1DAL->>1DAL: 하차지가 CAUTION_DONGS 소속?
    
    alt 일반 동네
        1DAL->>인성앱: "확정" 즉시 광클
    else 위험 동네 (예: 신사동)
        Note over 1DAL: ⚠️ 1단계: 동명이동 주의
        1DAL->>1DAL: 상세 화면 텍스트에서 customCityFilters 대조
        
        alt 화면에 상위 지역명 있음
            Note over 1DAL: ✅ 2단계 통과
            1DAL->>인성앱: "확정" 클릭
        else 화면에 상위 지역명 없음
            Note over 1DAL: 🔍 3단계 돌입! cautionAction = VERIFY
            1DAL->>인성앱: "도착지" 팝업 클릭
            인성앱-->>1DAL: POPUP_DROPOFF 감지
            1DAL->>1DAL: 팝업 텍스트에서 customCityFilters 대조
            
            alt 팝업에 상위 지역명 있음
                Note over 1DAL: ✅ cautionAction = ACCEPT
                1DAL->>인성앱: "닫기" → 확정 화면 복귀
                1DAL->>인성앱: "확정" 클릭
            else 팝업에도 없음
                Note over 1DAL: ❌ cautionAction = CANCEL
                1DAL->>인성앱: "닫기" → 확정 화면 복귀
                1DAL->>인성앱: "취소" 클릭 (패널티 회피)
            end
        end
    end
```

---

## 5. 텔레메트리 생존신고 흐름

```mermaid
sequenceDiagram
    participant 1DAL as 1DAL 엔진
    participant TM as TelemetryManager
    participant 서버 as 1DAL 서버

    Note over TM: 서비스 시작 → start()

    loop 60초 주기 하트비트
        TM->>TM: heartbeatRunnable 발동
        TM->>서버: POST /scrap (data: [], screenContext, lat/lng)
        서버-->>TM: 200 OK (mode, filterConfig)
        TM->>1DAL: onModeReceived(mode)
    end

    Note over TM: 콜 수집 이벤트 발생!
    1DAL->>TM: enqueue(order)
    Note over TM: 300ms 디바운스 대기
    TM->>서버: POST /scrap (data: [order], ...)

    Note over TM: 화면 전환 감지!
    1DAL->>TM: forceFlushEvent()
    Note over TM: 200ms 디바운스
    TM->>서버: POST /scrap (screenContext 변경 반영)

    Note over TM: 판결 대기 모드 진입
    Note over TM: isWaitingDecision = true
    Note over TM: 폴링 주기 60초 → 1초로 전환
```
