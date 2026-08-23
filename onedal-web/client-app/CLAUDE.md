# client-app — 관제탑

기사님이 KEEP/CANCEL 결재하는 화면. Vite 6 + React 19 + Tailwind v4 (port 3000).
루트 [CLAUDE.md](../../CLAUDE.md) 가 먼저다 — **명령·커밋 게이트·경계를 넘는 규칙은 거기 있다.**
여기에는 **관제웹 안에서만 참인 것**만 둔다.

## 이건 버그가 아니라 규칙이다

- **두 화면은 서로 다른 필터를 고친다. 그 구분을 화면에서 지우지 않는다.**
  · ⚙️ 설정 → `baseFilter` (평소 설정, DB, 매일 아침 여기서 시작)
  · 🔍 필터 → `activeFilter` (**오늘만**, 메모리, 자정에 되돌아감)
  🔴 2026-08-12 에 `updateFilter` 가 **항상** baseFilter 에도 낙관적 반영을 해서
  새로고침하면 두 값이 갈라졌다 (*"설정에는 파주인데 필터를 열면 용인"*)

- **MANUAL 콜에는 KEEP/CANCEL 버튼을 띄우지 않는다** (`PinnedRouteCard` 의 `route.type !== 'MANUAL'`).
  기사님이 직접 잡은 콜은 서버가 이미 확정했다. 결재는 전화로 한다

- **저장된 값이 목록에 없으면 다른 항목을 대신 보여주지 않는다.**
  `<select>` 는 값이 안 맞으면 **첫 항목**을 그린다 — 화면이 조용히 거짓말한다.
  못 찾으면 `⚠️ (목록에 없음)` 으로 표시한다

- **종료된 콜은 사라지지 않고 "완료됨 · 취소/방출" 로 이동한다.**
  `mergeOrderViews(history, terminated, live)` — 안 보이는 것과 없어진 것은 다르다

## 🔐 앱(관제앱)의 구글 로그인은 **웹과 다른 길**이다 (2026-08-23)

- 🔴 **구글은 임베디드 웹뷰 안에서의 로그인을 정책으로 막는다**(`disallowed_useragent`).
  그래서 앱에서는 `<GoogleLogin>` 이 **에러도 없이 조용히 안 뜬다.**
  승인된 자바스크립트 원본에 `https://localhost` 를 넣어도 소용없다 —
  막는 이유가 **주소가 아니라 환경**이다. (넣어 보고 확인했다)
- 앱은 `@capgo/capacitor-social-login` 으로 **안드로이드 계정 선택창(OS)** 을 띄운다.
  `Login.tsx` 가 `isNativeApp()` 으로 갈라 그릴 뿐, **서버는 하나도 안 고쳤다.**
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
- ⚠️ 앱은 예전에 **개발자 우회(`/api/auth/bypass`)** 로 들어가고 있었다. 2026-08-23 에
  라이브에서 그 길을 막자 **로그인 수단이 하나도 없어졌다** — 그래서 이 작업을 했다

## 함정

- **접속 주소와 `.env` 주의사항은 루트 [CLAUDE.md](../../CLAUDE.md) 에 있다** (한 곳에만 둔다)

- 🔴 **"Should have a queue" / "change in the order of Hooks" 는 대개 코드 버그가 아니다.**
  훅(`useRef`·`useState`…)을 **하나 더하거나 뺀 직후**에 뜬다 — Vite 핫 리로드가 옛 상태를
  새 훅 목록에 이어붙이지 못해서다. **⌘+Shift+R 한 번이면 끝난다.**

  ```
  30. useEffect      →  useRef        ← 이 줄이 "새로 생긴 훅" 을 가리킨다
  ```

  2026-08-14 에 시뮬레이터에 `useRef` 하나를 더했다가 관제웹이 죽었고, 코드를 의심하며
  뒤졌다. **에러가 가리키는 줄을 먼저 볼 것** — 방금 더한 훅이면 새로고침이 답이다.
  진짜 조건부 훅이면 `if` 나 `&&` 안에서 훅을 부르는 자리가 있다.

## 신뢰할 수 있는 문서 (2026-08-07 · 08-09 대조)

`docs/STATE_MANAGEMENT.md` — 코드와 일치
`docs/SOCKET_EVENT_MAP.md` (v2) — 2026-08-09 재작성
