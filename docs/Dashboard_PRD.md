# 1DAL 기사 대시보드 PRD (Product Requirements Document)

> **문서 상태**: Draft  
> **작성일**: 2026-05-01  
> **참조 모델**: 카택스(Cartax) 관리자 대시보드  
> **기반 데이터**: 1DAL Database Schema v5

---

## 1. 개요 (Overview)

**목적:** 1DAL 시스템을 사용하는 기사들이 본인의 운행 실적, 정산 상태, 장소 인사이트를 한눈에 파악하고, 카택스 수준의 체계적인 운행기록(국세청 양식 호환) 관리가 가능하도록 돕는 종합 관제 화면입니다.

**대상 사용자:** 1DAL 플랫폼을 이용하는 화물/퀵 기사 및 관제탑 관리자.

---

## 2. 화면 구성 및 핵심 기능 (Features)

대시보드는 크게 5개의 위젯 영역으로 구성됩니다.

### 2.1 상단 요약 보드 (Key Metrics)
현재(오늘/이번달)의 핵심 성과 지표를 카드 형태로 상단에 배치합니다.

*   **당일/당월 누적 매출:** `orders.fare` 합산.
*   **당일/당월 주행 거리:** `orders.totalDistanceKm` 합산 (카택스 핵심 기능).
*   **km당 운임 효율 (단가):** `총 매출 / 총 주행거리` (콜의 질을 평가하는 척도).
*   **미수금 총액 (🚨 빨간색 강조):** `settlementStatus = '미수금'`인 건들의 `unpaidAmount` 합산.

### 2.2 매출 & 주행거리 추이 (Analytics Chart)
막대/선 그래프를 통해 성과를 시각적으로 분석합니다.

*   **주간/월간 매출 막대그래프:** 일별/월별 매출 상승/하락 추이 파악.
*   **주행거리 선 그래프:** 매출 그래프 위에 겹쳐서 표시하여, "적게 뛰고 많이 번 날(효율 좋은 날)"을 직관적으로 확인.

### 2.3 운행 기록 장부 (Driving Log & Export)
카택스처럼 국세청 제출이나 개인 장부용으로 쓸 수 있는 상세 리스트입니다.

*   **다중 경유지 표시 지원:** `orderStops`를 조인하여 상/하차지가 여러 곳이어도 한 줄의 아코디언(펼침) UI로 깔끔하게 표시.
*   **표시 항목:** 배차시간, 완료시간, 상차지, 하차지, 차종, 운임, 주행거리.
*   **엑셀 다운로드 버튼:** 화면의 데이터를 `.csv`나 `.xlsx`로 즉시 추출 (세금 신고 및 영수증 증빙용).

### 2.4 원클릭 정산 관리 (Settlement Manager)
미정산/미수금 건을 빠르게 처리하는 액션 영역입니다.

*   **미수금 리스트 타일:** 결제처(`payerName`), 연락처, 미수금액, 입금예정일(`dueDate`) 표시.
*   **[정산 완료] 버튼:** 클릭 시 즉시 DB의 `settlementStatus`를 '정산완료'로 바꾸고, `settledAt`에 현재 시각을 찍어 정산 처리.

### 2.5 장소 인사이트 보드 (Place Intelligence)
v5 스키마의 핵심인 `places` 테이블을 활용한 AI 배차 보조 데이터입니다.

*   **🔥 단골 핫스팟 TOP 5:** `visitCount`가 가장 높은 장소를 랭킹으로 표시. ("여기는 물건이 많이 나오는 곳이니 근처에서 대기하자"는 전략 수립 가능)
*   **⛔ 블랙리스트 경고판:** `rating`이 2점 이하인 장소 목록 노출. (사유: `blacklistMemo` 표시) → 똥콜/위험 장소 사전 인지.

---

## 3. 데이터베이스 연동 맵핑 (Data Mapping)

대시보드 위젯을 그리기 위해 v5 스키마에서 데이터를 가져오는 방식입니다.

| 위젯 | 연동 데이터 (v5 Schema) |
| :--- | :--- |
| **요약 보드** | `SELECT SUM(fare), SUM(totalDistanceKm) FROM orders WHERE userId = ? AND status = 'completed'` |
| **미수금 위젯** | `SELECT SUM(unpaidAmount) FROM orders WHERE settlementStatus = '미수금'` |
| **운행 기록표** | `orders` + `orderStops` 조인 (과거 영수증 유지를 위해 `s.customerNameSnapshot` 사용) |
| **핫스팟 랭킹** | `SELECT addressDetail, visitCount FROM places ORDER BY visitCount DESC LIMIT 5` |
| **블랙리스트** | `SELECT addressDetail, blacklistMemo FROM places WHERE rating <= 2.0` |

---

## 4. 향후 확장성 (Phase 2)
*   **알림 연동:** 입금 예정일(`dueDate`)이 지났는데 `settledAt`이 NULL인 경우 앱 푸시 알림.
*   **스마트 자동 수락:** 핫스팟 TOP 10 장소에서 출발하는 콜이 인성앱에 뜨면 필터 조건 무시하고 0.1초 만에 자동 수락.
