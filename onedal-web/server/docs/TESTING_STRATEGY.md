# 🧪 1DAL 백엔드 테스트 전략

> **문서 상태**: v3.0 (코드 동기화)  
> **SSOT 코드**: `tests/core/engine/` 디렉토리

---

## 1. 테스트 구조

```
tests/core/engine/
├── PricingEngine.test.ts      # 요율 엔진 (순수 함수, 외부 의존성 없음)
├── StateMachine.test.ts       # 상태 전이 (순수 로직, 외부 의존성 없음)
└── OrderEvaluator.test.ts     # 콜 심사 파이프라인 (DB/카카오 모킹)
```

실행: `npx jest`

---

## 2. 단위 테스트 커버리지

### PricingEngine.test.ts — 3개 케이스

| 케이스 | 입력 | 기대 결과 |
|--------|------|-----------|
| 꿀콜 판정 | 10km, 1t, 수수료23%, 실제8000원 | fairPrice=7700, minAcceptable=6930, verdict=HONEY |
| 똥콜 판정 | 10km, 1t, 수수료23%, 실제6500원 | verdict=UNDERPAID |
| 적정 판정 | 10km, 1t, 수수료23%, 실제7000원 | verdict=FAIR |

### StateMachine.test.ts — 3개 케이스

| 케이스 | 입력 | 기대 결과 |
|--------|------|-----------|
| 첫짐 KEEP | STANDBY + advanceOnKeep(['판교'], ['1t']) | dispatchPhase=GATHERING, isSharedMode=true |
| 전체 취소 | GATHERING + rollbackOnCancel(session, 0) | dispatchPhase=STANDBY, isSharedMode=false |
| 부분 취소 | DRIVING + rollbackOnCancel(session, 1) | dispatchPhase 변경 없음, isActive=true |

### OrderEvaluator.test.ts — 2개 케이스

외부 의존성 모킹:
- `SettingsRepository` → 가짜 요율 설정
- `kakaoService` → 가짜 지오코딩/라우팅 결과
- `userSessionStore` → 가짜 세션 상태

| 케이스 | 입력 | 기대 결과 |
|--------|------|-----------|
| 꿀콜 통과 | fare=15000, vehicleType=1t, 키워드 없음 | isRejected=false, approvalReasons.length > 0 |
| 복합 거절 | fare=3000(하한미달) + rawText에 '착불' | isRejected=true, 하한가미달+제외키워드+요율미달 사유 3개 |

---

## 3. 테스트 실행 방법

```bash
# 전체 실행
npx jest

# 특정 파일만
npx jest tests/core/engine/PricingEngine.test.ts

# 워치 모드 (파일 변경 시 자동 재실행)
npx jest --watch
```

---

## 4. E2E 검증 (수동)

단위 테스트로 커버하지 않는 실제 통신 플로우는 앱/관제탑으로 직접 확인합니다:

| 플로우 | 검증 방법 |
|--------|-----------|
| Piggyback 전달 | 앱 → `/api/scrap` → 응답에 `decision` 필드 포함 확인 |
| 데스밸리 타이머 | 콜 확정 후 35초 방치 → `order-canceled` 소켓 이벤트 발생 확인 |
| KEEP/CANCEL 반영 | 관제탑 KEEP 클릭 → 앱에서 자동 [닫기] 터치 실행 확인 |
| 합짐 모드 전환 | 첫짐 KEEP → activeFilter.dispatchPhase가 GATHERING으로 변경 확인 |
