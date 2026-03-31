# TRD: Next.js → Vite+React + Express 구조 전환

## 변경 배경

| 현재 (Next.js) | 문제점 |
|---------------|--------|
| 커스텀 server.ts로 Socket.io를 억지로 끼움 | Next.js의 장점(SSR/SEO)을 하나도 못 씀 |
| Vercel 배포 불가 (커스텀 서버 때문) | 배포 옵션이 제한됨 |
| 프론트+백엔드가 한 덩어리 | 역할 분리 불명확 |

## 변경 후 구조

```text
onedal-web/
├── client/                  ← Vite + React (대시보드 화면)
│   ├── src/
│   │   ├── App.tsx          ← 메인 대시보드 (콜 카드 + 소켓 수신)
│   │   ├── pages/
│   │   │   └── Settlement.tsx  ← 정산 페이지
│   │   └── components/
│   │       ├── CallCard.tsx    ← 콜 정보 카드
│   │       └── AlertSound.tsx  ← 알림음 재생
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── server/                  ← Express + Socket.io (API + 소켓)
│   ├── src/
│   │   ├── index.ts         ← 서버 진입점 (Express + Socket.io)
│   │   ├── routes/
│   │   │   ├── orders.ts    ← POST /api/orders (콜 수신 + 소켓 발사)
│   │   │   └── intel.ts     ← POST /api/intel (빅데이터 수집)
│   │   └── db.ts            ← SQLite 연결
│   ├── tsconfig.json
│   └── package.json
│
└── docs/                    ← 문서 (현재 위치)
```

## 데이터 흐름 (변경 없음)

```text
[A24 스캐너] ─HTTP POST─→ [Express 서버 :4000] ─Socket.io─→ [React 대시보드 :5173]
                            /api/orders            "new-order"    콜 카드 표시 + 🔔
```

## 기존 코드 → 새 코드 매핑

| 기존 (Next.js) | 새 위치 | 변경사항 |
|---------------|---------|---------|
| `src/app/page.tsx` | `client/src/App.tsx` | Next.js 의존성 제거, 순수 React로 전환 |
| `src/app/settlement/page.tsx` | `client/src/pages/Settlement.tsx` | React Router로 라우팅 |
| `src/app/api/orders/route.ts` | `server/src/routes/orders.ts` | Express Router로 전환 |
| `src/app/api/intel/route.ts` | `server/src/routes/intel.ts` | Express Router로 전환 |
| `src/lib/socket.ts` | `server/src/index.ts` 내 통합 | 글로벌 변수 불필요 (Express에서 직접 접근) |
| `server.ts` | `server/src/index.ts` | Next.js 제거, 순수 Express+Socket.io |
| `src/app/layout.tsx` | `client/index.html` | 다크 테마, SEO 메타 태그 |

## 기술 스택

| 역할 | 기술 | 버전 |
|------|------|------|
| 프론트 프레임워크 | React | 19 |
| 프론트 번들러 | Vite | 6 |
| 프론트 라우팅 | React Router | 7 |
| 프론트 스타일링 | TailwindCSS | 4 |
| 서버 프레임워크 | Express | 5 |
| 실시간 통신 | Socket.io | 4 |
| DB (MVP) | SQLite (better-sqlite3) | - |
| 서버 실행 | tsx (개발) / node (운영) | - |

## 배포 계획

| 역할 | 서비스 | 비용 |
|------|--------|------|
| 프론트 | AWS S3 + CloudFront | ~0원 |
| 서버 | AWS EC2 (t2.micro) | 12개월 무료 |
| DB | EC2 내 SQLite 파일 | 0원 |

## 삭제 대상

기존 Next.js 관련 파일들을 정리합니다:
- `src/app/` 전체 (Next.js App Router)
- `server.ts` (커스텀 서버)
- `src/lib/socket.ts` (글로벌 소켓)
- `next.config.ts`, `postcss.config.mjs`
- Next.js 관련 npm 패키지 (`next`, `eslint-config-next`, `@tailwindcss/postcss`)

## 작업 순서

1. `client/` 폴더 생성 → Vite+React 프로젝트 초기화
2. 기존 `page.tsx`, `settlement/page.tsx` 코드를 React 컴포넌트로 이식
3. `server/` 폴더 생성 → Express+Socket.io 서버 구축
4. 기존 API Route 코드를 Express Router로 이식
5. SQLite DB 연결
6. 기존 Next.js 파일 삭제
7. 로컬 테스트 (curl + 브라우저)
8. Git 커밋 + 푸시

## 주의사항

- 기존 Next.js 파일은 새 코드가 정상 동작하는 것을 **확인한 뒤에** 삭제합니다.
- 삭제 전 반드시 승욱님 승인을 받습니다.
