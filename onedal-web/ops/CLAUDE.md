# ops — 1DAL 운영센터

관리자(와이프)가 PC · 폰 브라우저로 여는 화면 — 메뉴 여덟: 홈 · 통화 도우미 · 회원 · 지도 · 점검 · 운영 · 통계 · 기록(`src/ui.tsx` 의 `NAV` 한 표 — 줄마다 «들어올 때의 궁금증 · 할 수 있는 것»을 같이 적고 쪽 제목 아래 `PagePurposeBar` 가 그린다). Vite 8 + React 19 + Tailwind v4 (port 3002 · `pnpm dev:ops` 로 따로 띄운다).
루트 [CLAUDE.md](../../CLAUDE.md) 가 먼저다 — 명령·커밋 게이트·경계를 넘는 규칙은 루트 [README.md](../../README.md) 에 있다. 기획은 `reviews/29_운영센터_기획.md`.

## 이건 버그가 아니라 규칙이다

- **기사 운행 값을 쓰지 않는다** — 필터 · 판정 기준 · 결재(KEEP/CANCEL)는 기사 몫이다. 운영센터에는 그 버튼이 없다.
- **열람은 기록을 남긴다** — 회원의 위치 · 콜을 본 것도 `/audit` 에 남는다 (동의의 짝).
- **제3자 정보는 서버가 준 대로 보인다** — 가림은 서버(`services/mask.ts`)가 한다. 화면이 가리거나 풀지 않는다.
- **통화 도우미는 기사 «통화함»과 같은 구조 값(짐 단위 · 수량 · 약속 시각 · 메모)을 서버 통화 단계 행에 적는다** — 약속 시각의 기준 날은 그 콜의 상차 예정 시각의 한국 달력 날(`api/callNote.ts`). «상대가 취소했다»는 메모 글로만 — CANCEL 결재는 기사가 관제웹에서 누른다.
- **회원 상태는 사실 시각 칸에서 글로만 만든다** — `approvedAt` · `suspendedAt` · `paidUntil` 을 보고 «승인 대기 · 사용 중 · 정지 · 유예»를 그린다. 상태 이름 칸은 없다.

## 서버 문이 있는 쪽 · 예시 쪽

- **로그인은 실제다** — 구글 로그인(관제웹과 같은 웹 클라이언트 ID · `vite.config.ts` 의 `envDir` 가 관제웹 `.env.local` 을 읽는다) → 서버 `/api/ops/counts` 한 번. 403 이면 «허락이 없는 계정»(`/denied` · `users.ops_allowed_at`). 화면은 role 을 읽지 않는다(`opsLogin` 검사). 서버를 부르는 길은 `src/api/client.ts`(토큰 · 401 · 403) · `src/api/ops.ts`(`/api/ops/*` · 통계) · `src/api/socket.ts`(서버 `/ops` 이름공간 — «콜이 바뀌었다» 신호만 듣고 GET 으로 다시 읽는다 · 끊기면 30초마다) 셋뿐.
- **서버 문이 있는 쪽**(홈(`/api/ops/home` 한 번) · 통화 도우미 · 회원 · 회원 한 명(칸 다섯 — «폰 · 필터»는 `MemberPhoneFilter`) · 점검(`Inspect` — 서버 · 폰 접속 · 카카오 · 이상 기록) · 운영(`Manage` — 공지 · 페이지 글 · 앱 배포) · 통계 · 기록 · 지도(`/api/ops/locations` — 열람 기록은 서버가 남긴다))은 `useOps` 훅으로 읽고 쓰기 뒤 `reload()`. 서버가 안 되면 `ErrorBand`(«서버 응답이 없습니다 — 다시») — 🔴 예시 자료로 대신 그리지 않는다(장애를 가리면 노이즈).
- **예시 칸**(회원 쪽의 «매달 멤버 대조» — 6단계)은 `src/api/example.ts` + `src/mock/data.ts` 를 읽고 머리에 `ExampleBand`(«예시 자료입니다 — 서버 문은 N단계»)를 적는다. 서버 쪽은 `example.ts` 를 가져오지 않는다(`opsData` 검사).
- 🧪 **로컬 시험**: 우회 로그인 계정(DB 첫 유저 = 기사님 · 또는 probe)은 `ops_allowed_at` 이 비어 «허락이 없는 계정»이 뜬다 — 사본 DB 에서 `UPDATE users SET ops_allowed_at = datetime('now','localtime') WHERE email = …` 로 켠다. 기사님 `local.db` 는 기사님 손.
- 부품(버튼 · 표 · 배지 …)은 `@onedal/ui`(`onedal-web/ui/`)에서 온다 — 관제웹 파일을 직접 가져오지 않는다(`opsIsolated` 검사). `index.css` 의 `@source "../../ui/src"` 가 빠지면 부품이 회색으로 그려진다.
- 🔴 관제웹은 `ops/` 를 가져다 쓰지 않는다 (`opsIsolated` 검사) — 기사 폰이 받는 파일에 운영센터 코드가 섞이지 않게.
- **옛 주소는 새 자리로 넘긴다** — `/board` · `/phones` · `/anomalies` → `/inspect` · `/notices` · `/contents` · `/releases` → `/manage?tab=…` · `/members/check` → `/members?tab=check`(`App.tsx` · `opsShell` 검사).
- **개발 서버는 `/api` 와 `/socket.io` 를 서버로 넘긴다**(`vite.config.ts` 프록시 · 대상은 `OPS_API_TARGET` 없으면 4000) — 사본 서버로 시험할 때도 화면은 같은 출처 그대로다. 빌드는 shared 의 안 쓰는 코드를 털어낸다(`.css` 는 예외).
