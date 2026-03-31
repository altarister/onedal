# onedal-web 현재 구현 현황 (Current State)

## 기술 스택
- **프레임워크**: Next.js 15 (App Router)
- **스타일링**: TailwindCSS
- **언어**: TypeScript
- **실시간 통신**: ❌ WebSocket 미적용. **HTTP Polling (2초 간격)**으로 임시 구현됨
- **DB**: ❌ 미적용. **서버 메모리(배열)**에 임시 저장 (서버 재시작 시 데이터 사라짐)
- **배포**: ❌ 미적용. 로컬 `npm run dev`로만 실행 가능

---

## 파일 구조 및 역할

```text
onedal-web/src/app/
├── layout.tsx             ← 글로벌 레이아웃 (다크 테마, 한국어 SEO)
├── page.tsx               ← 메인 대시보드 (콜 카드 + 알림음 + Wake Lock)
├── settlement/
│   └── page.tsx           ← 정산 페이지 (오늘 콜 수, 확정 건수, 콜 내역)
└── api/
    ├── orders/
    │   └── route.ts       ← 꿀콜 데이터 수신 (POST) + 목록 조회 (GET)
    └── intel/
        └── route.ts       ← 탈락 콜 빅데이터 수신 (POST) + 조회 (GET)
```

---

## 각 파일 상세 설명

### `/api/orders/route.ts` — 콜 데이터 수신 API
- **POST**: 스캐너 폰(onedal-app)이 `{"texts": ["서울 강남", "부산 해운대", "120만원"]}` 형태로 보내면 메모리 배열에 저장
- **GET**: 대시보드 화면이 2초마다 호출하여 현재 콜 목록을 가져감
- **한계**: 메모리 저장이므로 서버 재시작 시 모든 데이터가 사라짐. DB 연동 필요

### `/api/intel/route.ts` — 인텔(빅데이터) 수신 API
- **POST**: 탈락한 콜 데이터를 묶어서 수신하여 메모리에 축적
- **GET**: 축적된 인텔 데이터 조회
- **한계**: 위와 동일. 메모리 저장

### `page.tsx` — 메인 대시보드
- **Wake Lock**: `navigator.wakeLock.request('screen')` → 화면 꺼짐 방지 ✅
- **알림음**: Web Audio API로 "띵띵!" 사운드 자동 재생 ✅
- **콜 카드**: 출발지, 도착지, 금액이 큰 글씨로 표시 ✅
- **버튼**: `📞 상차지 전화` (tel: 딥링크), `🗺️ 카카오내비` (kakaonavi: 딥링크) ✅
- **한계**: 2초마다 서버에 GET 요청하는 Polling 방식. WebSocket으로 교체 필요

### `settlement/page.tsx` — 정산 페이지
- 오늘 날짜 기준 콜 수, 확정 건수 표시
- 콜 내역 리스트 표시

---

## 아직 안 만들어진 것 (TODO)

| 항목 | 현재 상태 | 최종 목표 |
|------|----------|----------|
| 실시간 통신 | Polling (2초) | **Socket.io (즉시)** |
| DB | 메모리 배열 | **Supabase (PostgreSQL)** |
| 카카오 경로 계산 | 미구현 | `/api/route` 엔드포인트 + 카카오 모빌리티 API |
| 우회율(Detour) 계산 | 미구현 | 서버에서 기존 경로 대비 우회 비용 계산 |
| 배포 | 로컬만 가능 | **Vercel 무료 배포** |
| 상차지 전화번호 | 하드코딩 (010-0000-0000) | 스캐너가 추출한 실제 번호 사용 |
