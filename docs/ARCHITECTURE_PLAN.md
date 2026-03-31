# 1DAL 글로벌 아키텍처 (Global Architecture Plan)

본 문서는 `onedal-app`(안드로이드 스캐너 엔진)과 `onedal-web`(웹 대시보드 서버) 간의 전체적인 시스템 상관관계를 정의합니다. 상세 아키텍처는 각 폴더 내부의 문서를 참고하세요.

## 🔗 시스템 상관관계 (The Master Flow)

1. **[Perception] onedal-app (Android)**
   - 스캐너 전용 공기계에서 인성앱 위에 백그라운드로 실행됩니다.
   - 접근성 권한을 통해 오더를 탐지하고, 꿀콜을 선점(터치)합니다.
   - 탐지/선점된 데이터를 `onedal-web` 서버로 1방향 전송(`HTTP POST`)합니다.

2. **[Intelligence] onedal-web/server (Express + Node.js)**
   - `onedal-app`이 던져준 데이터를 수신하여 실시간으로 처리합니다.
   - 수익성/우회율을 검증하고, 허들(합격선)을 넘은 콜에 한정하여 프론트엔드 대시보드로 알림(`WebSockets`)을 푸시합니다.

3. **[Action] onedal-web/client (Vite + React)**
   - 운전석 내비게이션 폰의 크롬 브라우저에 항상 켜져 있는 관제탑(Dashboard) 화면입니다.
   - 서버로부터 전송받은 알림과 콜 정보를 커다란 카드 형태로 띄워줍니다.
   - 기사님(Human-in-the-loop)이 해당 콜을 직접 확인하고 상차지 전화를 거는 등 최종 배차 결정을 내립니다.

## 📁 각 문서 매핑 가이드
- **안드로이드 내부 구조**: `onedal-app/docs/TRD.md`
- **웹 서버/프론트 구조**: `onedal-web/docs/TRD.md`
