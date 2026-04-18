# 아키텍처 리팩토링 및 모듈화 분석 보고서 (SaaS 전환 사전 작업)

개인화/어드민(SaaS) 작업을 시작하기 전, 현재 코드베이스가 **"다중 사용자"**를 감당할 수 있는지 점검한 결과, **대대적인 리팩토링(모듈화)이 필수적으로 선행되어야 합니다.**

현재 코드는 "단일 기기, 단일 사용자"를 전제로 작성된 **싱글톤(Singleton) 전역 변수** 위주의 구조입니다. 이 상태에서 다중 사용자 기능을 얹으면 여러 기사들의 배차 상태와 필터가 충돌하는 **치명적인 스레드 경합(Race Condition)**이 발생합니다.

---

## 1. 현재 코드의 문제점 (Technical Debt)

### 🚨 문제 1: 전역 변수에 의존하는 상태 관리 (가장 심각)
- `server/src/routes/detail.ts`: 
  ```typescript
  // 현재 구조 - 모든 사용자가 아래 하나의 변수를 공유함!
  let mainCallState: SecuredOrder | null = null;
  let subCalls: SecuredOrder[] = [];
  const pendingOrdersData = new Map<string, SecuredOrder>();
  ```
  **원인**: 기사 A가 콜을 잡았는데, 전역 변수인 `mainCallState`가 덮어씌워져 버려 기사 B의 화면에도 기사 A의 콜이 확정된 것처럼 꼬이게 됩니다.

### 🚨 문제 2: 필터 및 위치 정보의 단일화
- `server/src/state/filterStore.ts`: `let activeFilterConfig` 
- `server/src/state/locationStore.ts`: `let globalDriverLocation`
  **원인**: 기사 A가 "서울행"으로 필터를 바꾸면 기사 B의 필터도 똑같이 바뀌어버리고 내비게이션 현위치도 공유됩니다.

### 🚨 문제 3: 너무 비대한 라우터 (`detail.ts`가 900줄 이상)
- REST 라우팅, 소켓 브로드캐스트, 카카오 TSP 연산(다중 경유지 정렬), 오더 평가 수치(꿀콜/똥콜) 로직이 `detail.ts` 하나에 뭉쳐져 있습니다. 

---

## 2. 코드 리팩토링(모듈화) 계획 (어떻게 수정할 것인가?)

SaaS 개발(로그인/DB)에 돌입하기 전, **"Phase 0"** 단계로 아래의 파일들을 쪼개고 클래스화하여 독립적인 공간을 만듭니다.

### 단계 1: UserSession 객체화 (State 분리)
전역 변수로 굴러가던 상태들을 `UserSessionManager` 클래스로 묶어 `userId` 별로 관리하도록 뜯어고칩니다.
*   **생성 파일**: `server/src/services/SessionManager.ts`
*   **변경 방식**:
    ```typescript
    interface UserSession {
       mainCallState: SecuredOrder | null;
       subCalls: SecuredOrder[];
       pendingOrdersData: Map<string, SecuredOrder>;
       activeFilter: AutoDispatchFilter;
       driverLocation: { x: number; y: number };
    }
    
    // 이제 서버는 접속한 유저 수만큼 Session 맵을 갖게 됩니다.
    export const userSessions = new Map<string, UserSession>();
    ```

### 단계 2: 배차/라우팅 로직을 Router에서 분리
`detail.ts` 파일에서 "카카오 길찾기 평가" 및 "관제탑 판독(꿀콜/똥콜)"을 담당하는 두뇌 로직만 똑 떼어내어 Service 계층으로 넘깁니다. 라우터 파일은 단순히 HTTP 요청/응답만 하도록 가벼워집니다.
*   **생성 파일**: `server/src/services/dispatchEngine.ts` (꿀콜 판독 로직)
*   **생성 파일**: `server/src/services/kakaoService.ts` (TSP 길찾기 연산)

### 단계 3: Socket.io 핸들러 독립
`index.ts`에 70줄 이상 들어있는 `io.on('connection')` 코드들을 이벤트 종류별로 별도 파일로 뺍니다.
*   **생성 파일**: `server/src/socket/connectionHandler.ts`

---

## 3. 리팩토링 진행 로드맵

**현재 개발 계획의 단계 수정:**
- **[ Phase 0 ] 모듈화 및 OOP 리팩토링 (본 분석서 체제)** ⏪ *(이 작업 먼저 해야합니다!)*
- **[ Phase 1 ]** JWT 인증 로그인 및 SQLite 유저/세팅 DB 확장
- **[ Phase 2 ]** 카카오 개인화 파라미터 적용 (연비/톨게이트/1톤)
- **[ Phase 3 ]** 통합 어드민(관제탑) 페이지 UI 및 기능 오픈

이 리팩토링을 마치면 코드가 방 구조처럼 나뉘게 되어, "로그인한 유저는 내 방(객체)에서 내 데이터만 건드리는" 진정한 멀티 기반이 완성됩니다.
