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

## 함정

- **접속 주소와 `.env` 주의사항은 루트 [CLAUDE.md](../../CLAUDE.md) 에 있다** (한 곳에만 둔다)

## 신뢰할 수 있는 문서 (2026-08-07 · 08-09 대조)

`docs/STATE_MANAGEMENT.md` — 코드와 일치
`docs/SOCKET_EVENT_MAP.md` (v2) — 2026-08-09 재작성
