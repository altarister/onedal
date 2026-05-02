# 1DAL 크로스플랫폼 모노레포 아키텍처 계획서 (Web + Mobile)

> **문서 상태**: Draft (v2. React Native GPS 대응 반영)  
> **작성일**: 2026-05-01  
> **목적**: 관제탑(Mobile App), 운행일지/관리자(Web App)를 독립적으로 분리하면서 단일 백엔드/DB를 공유하는 구조 설계

---

## 1. 아키텍처 개요 (Cross-Platform Monorepo)

관제탑 앱은 **백그라운드 GPS 추적**이 필수적이므로 기존 웹(React) 방식에서 **모바일 네이티브(React Native / Expo)**로 전환해야 합니다. 
반면, 운행일지나 총괄 관리는 화면이 넓고 차트/엑셀 작업이 많은 **웹(React)**이 적합합니다.

이러한 이기종(Mobile + Web) 환경에서도 **"서버와 DB는 하나로 유지"**하고, **"타입스크립트 인터페이스는 공유"**하여 완벽한 동기화와 개발 효율을 달성하는 것이 핵심입니다.

### 분할의 핵심 이점
1. **플랫폼 최적화**: 
   * **관제탑 (Mobile)**: 백그라운드 GPS, 배터리 최적화, 푸시 알림, 네이티브 카카오맵에 집중.
   * **대시보드 (Web)**: 대화면 최적화, 무거운 차트 렌더링, 엑셀 다운로드에 집중.
2. **단일 진실 공급원 (SSOT)**: `shared` 폴더를 통해 모바일 앱과 웹 앱이 완전히 동일한 데이터 규격(v5 스키마 등)을 바라보게 되어 버그가 원천 차단됩니다.

---

## 2. 워크스페이스 구조 (pnpm-workspace.yaml)

현재 `onedal-web` 폴더 내에 아래와 같이 구성됩니다.

```text
onedal-web/
 ├─ pnpm-workspace.yaml
 ├─ shared/       # (공통) DB 스키마, 소켓 이벤트 등 공통 타입 보관
 ├─ server/       # (백엔드 통합) SQLite 독점. 모바일 API & 웹 API 모두 서빙
 │
 ├─ mobile-app/   # [Frontend 1] 실시간 배차 관제탑 (React Native/Expo) - GPS 탑재
 ├─ logbook/      # [Frontend 2] 운행일지 & 정산 대시보드 (React Web) - logbook.onedal.com
 └─ admin/        # [Frontend 3] 향후 총괄 관리자 앱 (React Web) - admin.onedal.com
```

> **참고:** 기존 `client` 폴더는 점진적으로 `mobile-app`으로 마이그레이션 및 대체됩니다.

---

## 3. 라우팅 및 기술 스택 전략

| 패키지명 | 목적 | 배포 타겟 | 주요 기술/라이브러리 |
| :--- | :--- | :--- | :--- |
| **server** | 통합 API & 소켓 제공 | `api.onedal.com` | Express, Socket.io, SQLite3 |
| **mobile-app** | 관제탑 (GPS, 오더 경합) | Android (APK/AAB) | **React Native (Expo)**, expo-location (Background GPS) |
| **logbook** | 장부, 차트, 엑셀 다운로드 | `logbook.onedal.com` | React (Vite), Recharts, SheetJS(엑셀) |
| **admin** | 총괄 유저 관리 | `admin.onedal.com` | React (Vite), TailwindCSS |

---

## 4. 모바일 + 웹 통합 시 기술적 허들 (시니어 해결책)

앱(React Native)과 웹(React)이 하나의 서버를 바라볼 때 발생하는 가장 큰 문제는 **"인증(Auth) 방식의 차이"**입니다. 이를 해결하기 위한 투트랙 전략이 필요합니다.

### 4.1. 하이브리드 인증 (Hybrid Auth)
*   **문제**: 웹 브라우저는 쿠키(Cookie)를 알아서 저장하고 전달하지만, 모바일 앱(React Native)은 브라우저 쿠키를 사용하기 까다롭습니다.
*   **해결**: 서버(`server`)는 로그인 시 두 가지를 모두 발급해야 합니다.
    1. **모바일 앱용**: 헤더에 담을 수 있는 JWT (또는 Access Token) 발급. 모바일은 이를 `AsyncStorage`에 저장하고 매 API 요청마다 `Authorization: Bearer <token>` 형태로 보냅니다.
    2. **웹용 (logbook, admin)**: `.onedal.com` 도메인에 쿠키(Cookie) 발급. 브라우저가 알아서 SSO(Single Sign-On)를 유지합니다.

### 4.2. 소켓 연결 최적화
*   **문제**: 모바일 앱이 백그라운드로 내려가면 OS가 소켓 연결을 강제로 끊습니다 (배터리 절약 목적).
*   **해결**: `mobile-app`에서는 화면이 꺼졌을 때 소켓 대신 **FCM(Firebase Cloud Messaging)** 푸시나 **백그라운드 Fetch**로 우회하여 콜을 수신하고, GPS는 `expo-location`의 백그라운드 태스크로 쏘도록 설계해야 합니다.

---

## 5. 단계별 실행 계획 (Phase)

### Phase 1: 백엔드 통합 & v5 스키마 반영 (가장 시급함)
1. `server/src/db.ts`에 v5(장부용) 스키마 반영.
2. `server`에 하이브리드 인증(Token + Cookie) 구조 기반 마련.
3. 기존 웹 관제탑(`client`)은 당분간 현행 유지 (모바일 전환 전까지 사용).

### Phase 2: Logbook (운행일지 웹) 스캐폴딩
1. `pnpm create vite logbook` 으로 웹 대시보드 생성.
2. `Dashboard_PRD.md` 에 맞춰 요약 카드, 매출 추이 차트, 엑셀 다운로드 구현.
3. `logbook.onedal.com` 으로 배포하여 기존 관제탑 웹(`client`)과 듀얼 모니터로 쓰도록 환경 구성.

### Phase 3: 모바일 관제탑 (React Native) 전환
1. `pnpm create expo-app mobile-app` 으로 모바일 프로젝트 생성.
2. 기존 `client`의 로직(오더 경합, 필터)을 `mobile-app`으로 이식.
3. **핵심**: `expo-location`을 활용한 백그라운드 GPS 위치 전송 로직 구현.
4. 개발 완료 후 기존 `client` 웹 패키지는 폐기(Deprecate).

### Phase 4: 어드민 (Admin 웹) 확장
1. 모든 기사의 GPS 실시간 관제 지도 화면 구현.
2. 전체 기사 정산/미수금 통합 관리 보드 구현.
