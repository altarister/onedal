# 1DAL 글로벌 기획서 (Global PRD)

본 문서는 `onedal-app`과 `onedal-web` 두 개로 나뉘어진 1DAL 시스템이 어떻게 하나의 거대한 서비스로 융합되어 수익을 창출하는지를 정의합니다. 

## 🔗 제품 상관관계 (Product Ecosystem)

1DAL 시스템은 **기계의 압도적인 속도**와 **인간의 신중한 판단력**을 결합한 '반자동 칵핏(Cockpit)' 구조입니다.

- **[onedal-app] 무엇을 만들어야 하는가? (안드로이드 기능)**
  1. **화면 캡처 및 노드 분석**: AccessibilityService를 통해 인성앱 화면의 텍스트(출도착지, 요금)를 초고속으로 읽어냄.
  2. **수익성 필터링 알고리즘**: 설정된 단가표 및 선호 지역에 부합하는지 즉시 계산.
  3. **0.1초 자동 터치 (Auto-Click)**: 조건이 맞으면 사람보다 빠르게 [상세] 버튼 선점 터치.
  4. **웹훅 발송**: 성공/실패한 모든 콜 데이터를 `onedal-web`으로 전송 (HTTP POST).

- **[onedal-web] 무엇을 만들어야 하는가? (웹 UI 및 서버 기능)**
  1. **실시간 통계/알림 서버**: Express 서버가 콜 데이터를 받아 SQLite에 저장하고 Socket.io로 푸시.
  2. **관제 대시보드 UI**: Vite+React 컴포넌트로 출발지/도착지/요금을 큼직한 카드로 시각화.
  3. **공통 타입 허브**: `@onedal/shared` (pnpm workspace)를 패키징하여 Android Payload, DB Schema, React Prop을 100% 동기화.
  4. **무중단 알림 시스템**: Wake Lock으로 화면 꺼짐을 막고, 새 콜 수신 시 "띵띵" 사운드 재생.
  5. **휴먼 인 더 루프 체계**: 카드 내 [전화걸기(tel:)], [길안내(kakaonavi:)] 원터치 버튼을 제공하여 운전자의 최종 판단을 지원.

※ 상세 기획은 각 파트별 문서를 참고하세요.
- **안드로이드 기획 상세**: `onedal-app/docs/PRD.md`
- **웹 대시보드 기획 상세**: `onedal-web/docs/PRD.md`