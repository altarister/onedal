# ui — `@onedal/ui`

관제웹 · 운영센터가 함께 쓰는 **브라우저 부품** — 버튼 · 카드 · 배지 · 입력 · 고르기 · 탭 · 대화창 … 과 `cn` · 테마 토글. React 의존이라 `shared`(의존 0 · 서버가 읽음)에 못 두는 것들이 여기 산다.
루트 [CLAUDE.md](../../CLAUDE.md) 가 먼저다 — 명령·커밋 게이트·경계를 넘는 규칙은 루트 [README.md](../../README.md) 에 있다.

## 이건 버그가 아니라 규칙이다

- **빌드가 없다** — `exports` 가 `src/*.tsx` 를 그대로 가리킨다. 쓰는 앱(Vite)이 TS 를 직접 읽는다 (`shared` 와 같은 방식).
  `import { Button } from '@onedal/ui/button'` · `import { cn } from '@onedal/ui/utils'` · `import { ThemeProvider, useTheme } from '@onedal/ui/theme'`.
- 🔴 **쓰는 앱의 `index.css` 에 `@source "../../ui/src";` 가 있어야 한다** — Tailwind v4 는 `node_modules` 밑(작업 공간 링크)을 안 훑어, 빠지면 부품이 회색으로 그려진다. `themeSingleSource` · `opsIsolated` 검사가 문다.
- **색 · 글꼴 · 둥글기 값은 여기 없다** — `shared/src/theme.css` 한 곳이다. 부품은 토큰 이름(`bg-surface` · `text-info` …)만 쓴다.
- **관제웹 전용 부품은 여기 안 온다** — `KnobGrid` · `PickLayer` · `collapse` 는 필터 화면에 매인 것이라 `client-app/src/components/ui/` 에 남는다(검사 넷이 그 경로를 읽는다).
- 서버 · 폰 · 소켓 · 저장소를 모른다 — 그런 의존이 필요한 부품은 여기 두지 않는다.
