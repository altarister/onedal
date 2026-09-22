# client-app — 관제탑

기사님이 KEEP/CANCEL 결재하는 화면. Vite 8 + React 19 + Tailwind v4 (port 3000).
루트 [CLAUDE.md](../../CLAUDE.md) 가 먼저다 — **명령·커밋 게이트·경계를 넘는 규칙은 거기 있다.**
여기에는 **관제웹 안에서만 참인 것**만 둔다.

## 이건 버그가 아니라 규칙이다

- **필터 두 그릇을 가르는 것은 화면이 아니라 버튼이다** (그릇 자체는 [server/CLAUDE.md](../server/CLAUDE.md)).
  · 🔍 필터에서 손대면 → `activeFilter` (메모리, 영업일이 바뀌면 되돌아감 = **오늘만**)
  · `💾 서버 저장` 을 누르면 → `baseFilter` 까지 (DB, 매일 아침 여기서 시작)
  · `↩︎ 되돌리기` 는 세 번째 저장이 아니라 **서버 값으로 되돌리는 것**이다
  · 편집 자리는 🔍 필터 하나다 — ⚙️ 설정에는 노선·반경 편집이 없다
  🔴 «저장 안 함»은 깃발(`dirty`)이 아니라 `baseFilter` 와 견주는 **파생**(`unsaved`)이다 —
  깃발은 켜는 건 안 잊어도 끄는 걸 잊어 화면이 거짓말한다
  🔴 `updateFilter` 는 `saveAsDefault` 일 때만 baseFilter 에 낙관적 반영을 한다 —
  늘 반영하면 새로고침 뒤 설정과 필터가 다른 목적지를 말한다

- **직접 갈래(MANUAL·MANUAL_CLICK) 콜에는 KEEP/CANCEL 버튼을 띄우지 않는다**
  (`PinnedRouteCard` 의 `!isManualLineage(route.type)` — 판별은 shared 의 `isManualLineage` 한 곳).
  기사님이 직접 잡은 콜은 서버가 이미 확정했다. 결재는 전화로 한다.
  🔴 `=== 'MANUAL'` 문자열 비교를 새로 쓰지 말 것 — type 이 두 표기(확정 전 `MANUAL_CLICK`)라
  한쪽을 빠뜨려 배지 누락·버튼 잔상이 생긴다

- **기사님의 취소 버튼은 `PinnedRouteCard` 의 «⋯ 이 콜 처리» 안에 일부러 접어 뒀다** (콜을 버리는 것은 기사님만 — 루트 규칙 ①)

- **저장된 값이 목록에 없으면 다른 항목을 대신 보여주지 않는다.**
  `<select>` 는 값이 안 맞으면 **첫 항목**을 그린다 — 화면이 조용히 거짓말한다.
  못 찾으면 `⚠️ (목록에 없음)` 으로 표시한다

- **아래 탭의 «정산»(`pages/Settlement.tsx`)은 이름만 정산이고 오늘 콜 수·매출 요약이다** — 관제웹에 정산 개념은 없다 (루트 «업무 단위»)

- **종료된 콜은 사라지지 않고 "완료됨 · 취소/방출" 로 이동한다.**
  `mergeOrderViews(history, terminated, live)` — 안 보이는 것과 없어진 것은 다르다

- **단위 테스트는 대개 화면을 그리지 않는다.** 많은 검사가 `codeOnly` 정규식이나 순수 함수만 본다 —
  부모가 필수 prop 을 빠뜨리거나 선언 안 된 변수를 써도 `vitest`·`tsc` 가 통과할 수 있다.
  핵심 화면을 고치면 마운트 스모크 테스트 하나 이상 + 브라우저에서 직접 본다 (`pnpm shot`)

## 🔐 앱(관제앱)의 구글 로그인은 **웹과 다른 길**이다

- 🔴 **구글은 임베디드 웹뷰 안에서의 로그인을 정책으로 막는다**(`disallowed_useragent`).
  그래서 앱에서는 `<GoogleLogin>` 이 **에러도 없이 조용히 안 뜬다.**
  승인된 자바스크립트 원본에 `https://localhost` 를 넣어도 소용없다 —
  막는 이유가 **주소가 아니라 환경**이다.
- 앱은 `@capgo/capacitor-social-login` 으로 **안드로이드 계정 선택창(OS)** 을 띄운다.
  `Login.tsx` 가 `isNativeApp()` 으로 갈라 그릴 뿐, 서버 검증은 웹과 같다.
- 🔴 **`webClientId` 에는 웹 클라이언트 ID 를 넣는다.** 그래야 `idToken` 의 `aud` 가
  웹 클라이언트 ID 라서 기존 `/api/auth/google` 검증이 그대로 통한다.
  **안드로이드용 클라이언트 ID 는 어디에도 안 넣는다** — 구글이
  *"이 패키지 + 이 서명은 정품"* 이라고 알아보게 하는 **등록**일 뿐이다.

구글 콘솔에 있는 것 (값은 콘솔이 원천 — 여기 복사해 두지 않는다):

| 유형 | 무엇 |
|---|---|
| 웹 애플리케이션 `1DAL Web App` | 관제웹·서버 검증이 쓰는 **진짜 ID** (`VITE_GOOGLE_CLIENT_ID`) |
| **Android** `1DAL Android` | 패키지 `kr.co.onedal.dashboard` + **디버그 키 SHA-1** 등록용 |

- ⚠️ **릴리스 키로 서명하면 SHA-1 이 달라진다.** 지문을 하나 더 등록하지 않으면
  **앱에서만 로그인이 조용히 실패한다.** 디버그 지문은 이렇게 다시 뽑는다:
  ```bash
  keytool -list -v -keystore ~/.android/debug.keystore \
          -alias androiddebugkey -storepass android -keypass android | grep SHA1
  ```
- ⚠️ OAuth 동의 화면이 **테스트 모드**면 등록된 **테스트 사용자**만 로그인된다
- ⚠️ 개발자 우회(`/api/auth/bypass`)는 **라이브에서 막혀 있다**(`isLiveServer`) — 라이브 앱의 로그인 수단은 이 구글 로그인 하나다

## 함정

- **접속 주소와 `.env` 주의사항은 루트 [CLAUDE.md](../../CLAUDE.md) 에 있다** (한 곳에만 둔다)

- 🔴 **"Should have a queue" / "change in the order of Hooks" 는 대개 코드 버그가 아니다.**
  훅(`useRef`·`useState`…)을 **하나 더하거나 뺀 직후**에 뜬다 — Vite 핫 리로드가 옛 상태를
  새 훅 목록에 이어붙이지 못해서다. **⌘+Shift+R 한 번이면 끝난다.**

  ```
  30. useEffect      →  useRef        ← 이 줄이 "새로 생긴 훅" 을 가리킨다
  ```

  **에러가 가리키는 줄을 먼저 볼 것** — 방금 더한 훅이면 새로고침이 답이다.
  진짜 조건부 훅이면 `if` 나 `&&` 안에서 훅을 부르는 자리가 있다.

  🔴 **props 서명을 바꾼 직후의 `Cannot read properties of undefined` 도 같은 병이다.**
  Vite 가 모듈만 갈아끼우고 **props 없이 부르던 옛 부모가 화면에 남으면** 새 prop 이 `undefined` 로 들어온다 —
  소스·`tsc`·검사·프로덕션 빌드는 멀쩡하다. 주소에 붙은 `?t=…` 가 HMR 로 갈아끼운 모듈의 표시다.
  **훅뿐 아니라 «서명을 바꾼 것»이면 새로고침을 먼저 해 본다.**
