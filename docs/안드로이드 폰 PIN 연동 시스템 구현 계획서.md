# 📱 안드로이드 폰 PIN 연동 시스템 구현 계획서

기사님의 선택이 탁월합니다! 구글 로그인 연동 없이 **6자리 PIN 코드** 하나로 웹-앱 호적(소유권)을 잇는 방식은 [1DAL SaaS 플랫폼]이 갖춰야 할 보안성과 사용성을 동시에 잡는 최고의 시나리오입니다.
이 문서는 백엔드, 웹 프론트엔드, 그리고 추후 안드로이드 개발 시 필요한 API 스펙까지 모두 포괄하는 종합 계획서입니다.

## User Review Required

> [!IMPORTANT]
> **보안 위협 방어: UUID의 토큰화**
> 안드로이드 앱에서 보내는 `deviceId` 자체를 비밀번호(Bearer Token)처럼 취급할 계획입니다. 기기에서 최초 1회 생성한 무작위 식별자(UUID)는 128비트 암호화 수준이므로 제3자가 추측해서 가짜 콜 데이터를 넣는 것은 수학적으로 불가능합니다. 따라서 앱에서 별도의 로그인 토큰 관리를 구현할 필요 없이 가장 견고한 보안이 달성됩니다. 이 방침에 동의하시는지 확인해 주세요.

## Proposed Changes

---

### [Database & Memory] 페어링 임시 저장소
PIN 번호는 3분 동안만 유효한 임시 암호이므로 리소스를 낭비하는 SQLite DB보다는 서버 메모리(`Map`)를 사용하여 관리합니다.

#### [NEW] `server/src/state/pairingStore.ts` (신규 파일)
- 6자리 난수를 생성하고 메모리에 보관하는 스토어
- 구조체: `Map<string, { userId: string, expiresAt: number }>`
- 만료 시간(3분)이 지나면 자동 폐기(TTL 로직)

---

### [Backend] API 엔드포인트 설계

#### [NEW] `POST /api/devices/pin` (관제 웹 전용)
- **요청:** 웹 로그인 세션 (Auth 헤더)
- **로직:** 서버가 6자리 숫자(예: `294105`)를 생성. 메모리에 `[PIN] -> [해당 기사님의 userId]` 매핑 값 저장.
- **응답:** `{ pin: "294105", expiresIn: 180 }` (3분 타이머용)

#### [NEW] `POST /api/devices/pair` (안드로이드 앱 전용)
- **요청:** `{ pin: "294105", deviceId: "UUID-랜덤값", deviceName: "Galaxy S23" }`
- **로직:**
  1. 서버의 메모리에서 해당 `pin` 번호를 조회.
  2. 조회 성공 시 핀 폐기 처리 (1회용).
  3. `user_devices` SQLite 테이블에 `(userId, deviceId, deviceName)`을 정식 INSERT. (기사님 호적에 폰 귀속 완료)
  4. 웹 소켓으로 `io.to(userId).emit("device-paired", deviceInfo)` 이벤트를 쏴서 관제 웹의 핀 입력 대기 팝업을 즉시 닫아줌.
- **응답:** `{ success: true }`

---

### [Frontend] 웹 UI 구현

#### [MODIFY] `client/src/components/dashboard/SettingsModal.tsx`
- 설정 창에 탭 구조(`기본 설정`, `기기 관리`) 도입
- **기기 관리 영역:** 
  - 현재 내 계정에 등록(페어링)된 안드로이드 폰 리스트 조회 및 즉시 이름 변경(수정) 기능
  - 접속 해제/삭제 버튼 (폰 분실 시 권한 무효화)
  - `[새 기기 연동하기]` 버튼
- **연동 팝업 UI:** `[새 기기 연동하기]`를 누르면 6자리 대형 PIN 번호와 남은 시간(3:00) 타이머 플레이

#### [MODIFY] `client/src/hooks/useDevices.ts`
- 기존 폴링 로직에 더불어 기기 목록 관리용 Fetch 로직 및 소켓 `device-paired` 이벤트 수신 로직 추가

---

### [Android] 앱 개발자를 위한 지침서 (참고용)
앱 개발 시 이 두 가지만 구현하면 됩니다.
1. **최초 실행 시:** (저장된 UUID가 없거나 짝없는 UUID일 경우) 화면에 `<PIN 6자리 입력>` 창만 띄우고 `POST /api/devices/pair` 호출.
2. **평상시:** 기존 하던 방식 그대로, 저장된 `deviceId`(UUID)를 넣어서 `POST /api/scrap` 호출.

---

## Open Questions

> [!WARNING]
> 현재 `user_devices` 테이블 스키마에 `UNIQUE(user_id, device_id)` 제약조건이 걸려있습니다. 
> 기사님이 폰을 삭제하고 다시 같은 폰으로 핀 연결을 할 수도 있는데 이때 오류가 나지 않도록 `INSERT OR REPLACE` 구문을 써서 처리할 예정입니다.
> 
> 질문: 이 연동 작업 완료 시점부터는, 정식으로 페어링(등록)되지 않은 `deviceId`가 쏘는 콜(scrap) 데이터는 백엔드에서 보안상 "무시(Reject 401)"하도록 하드 락을 걸 예정입니다. 바로 적용해도 괜찮을까요?

## Verification Plan

### Automated Tests
1. 관제 웹에서 빈 기기 리스트 상태 확인
2. `[새 기기 등록]`을 눌러 PIN(예: `123456`) 팝업 오픈
3. 서버 콘솔이나 터미널에서 강제로 `curl -X POST /api/devices/pair -d '{"pin":"123456", "deviceId":"test-phone"}'`을 날리기
4. 날리자마자 관제 웹 팝업이 자동으로 닫히며 기기 리스트에 'test-phone'이 짠 하고 나타나는 3각 소켓 동기화 현상 육안 확인!


# 📱 안드로이드 폰 PIN 연동 시스템 구현 계획서 (v2 — 코드 리뷰 반영)

## 전체 구현 범위 요약

| 구분 | 파일 | 작업 내용 |
|------|------|-----------|
| **[NEW]** | `server/src/state/pairingStore.ts` | 6자리 PIN 생성기 + TTL 메모리 스토어 |
| **[MODIFY]** | `server/src/routes/devices.ts` | `POST /pin`, `POST /pair`, `DELETE /:deviceId`, `GET /registered` 엔드포인트 추가 |
| **[MODIFY]** | `server/src/routes/scrap.ts` | 미등록 기기 하드 락(401 Reject) 게이트 추가 |
| **[MODIFY]** | `server/src/routes/orders.ts` | confirm/decision에서도 미등록 기기 차단 |
| **[MODIFY]** | `server/src/socket/socketHandlers.ts` | `device-paired` 이벤트 브로드캐스트 지원 |
| **[MODIFY]** | `client/src/components/dashboard/SettingsModal.tsx` | 탭 구조 도입 + 기기 관리 UI + PIN 팝업 |
| **[MODIFY]** | `client/src/components/dashboard/DeviceControlPanel.tsx` | deviceName 표시 |
| **[MODIFY]** | `shared/src/index.ts` | `DeviceSession`에 `deviceName` 필드 추가 |

---

## Proposed Changes (상세)

### 1. `pairingStore.ts` — PIN 생성 및 관리

```typescript
// 핵심 구조
const pendingPins = new Map<string, { userId: string, expiresAt: number }>();

export function generatePin(userId: string): string {
    // 기존 미사용 핀 정리 후 6자리 생성
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    pendingPins.set(pin, { userId, expiresAt: Date.now() + 180_000 }); // 3분
    return pin;
}

export function consumePin(pin: string): string | null {
    const entry = pendingPins.get(pin);
    if (!entry || Date.now() > entry.expiresAt) {
        pendingPins.delete(pin);
        return null; // 만료 or 미존재
    }
    pendingPins.delete(pin); // 1회용 소멸
    return entry.userId;
}
```

### 2. `devices.ts` — API 엔드포인트 추가

| Method | Path | 인증 | 용도 |
|--------|------|------|------|
| `POST` | `/api/devices/pin` | ✅ JWT (웹) | PIN 발급 요청 |
| `POST` | `/api/devices/pair` | ❌ 미인증 | 앱이 PIN+UUID로 페어링 |
| `GET` | `/api/devices/registered` | ✅ JWT (웹) | 내 계정에 등록된 기기 목록 조회 |
| `DELETE` | `/api/devices/:deviceId` | ✅ JWT (웹) | 기기 연동 해제 (분실/교체 시) |

> [!IMPORTANT]
> `POST /api/devices/pair`는 **인증 없이** 호출됩니다. 안드로이드 앱은 아직 로그인 전이므로 JWT 토큰이 없습니다. PIN 번호 자체가 1회용 인증 수단 역할을 합니다.

### 3. `scrap.ts` / `orders.ts` — 미등록 기기 하드 락

```typescript
// scrap.ts 최상단에 게이트 추가
if (deviceId) {
    const deviceRow = db.prepare(
        "SELECT user_id FROM user_devices WHERE device_id = ?"
    ).get(deviceId);
    
    if (!deviceRow) {
        return res.status(401).json({ 
            error: "UNREGISTERED_DEVICE",
            message: "이 기기는 등록되지 않았습니다. 관제 웹에서 PIN 연동을 먼저 진행해주세요." 
        });
    }
    userId = deviceRow.user_id;
}
```

### 4. `SettingsModal.tsx` — 기기 관리 UI

- 탭 구조: `[기본 설정]` | `[📱 기기 관리]`
- 기기 관리 탭 내용:
  - 등록된 기기 리스트 (device_name, device_id 축약, 등록일)
  - 각 기기별 이름 수정 인풋 + 삭제 버튼
  - `[+ 새 기기 연동하기]` → 6자리 PIN 대형 표시 + 3분 카운트다운 팝업

### 5. `DeviceControlPanel.tsx` — 이름 표시

```tsx
// 기존: device.deviceId 만 표시
// 변경: deviceName이 있으면 함께 표시
<span>{device.deviceName || device.deviceId}</span>
```

---

## 🔍 구현 전 사전 확인 질문 리스트

코드베이스를 면밀히 검토한 결과, 아래 **5가지 사항**에 대해 기사님의 방침을 미리 확인해야 구현 중 막힘 없이 진행할 수 있습니다.

### Q1. `deviceId` 없이 오는 요청 처리

현재 `scrap.ts`에서 `deviceId`는 **optional** 필드입니다 (`deviceId?: string`). 
즉, `deviceId` 자체를 아예 안 보내는 레거시 클라이언트나 DevTools 시뮬레이션 요청도 존재할 수 있습니다.

**제 방침:** `deviceId`가 아예 없는 요청(`undefined`)은 401로 차단합니다. 앞으로는 모든 앱 요청에 반드시 `deviceId`가 포함되어야 합니다. (DevTools 시뮬레이션은 별도의 테스트 `deviceId`를 하드코딩하겠습니다)

**👉 동의하시나요?**

---

### Q2. 같은 기기를 여러 계정에 묶는 상황 방지

현재 DB 스키마는 `UNIQUE(user_id, device_id)`입니다. 이 말은 **같은 UUID 폰이 기사 A에도, 기사 B에도 동시 귀속(등록)이 가능하다**는 뜻입니다.

**제 방침:** `device_id` 컬럼 자체에 `UNIQUE` 제약조건을 추가해서, 하나의 물리 폰은 **오직 한 명의 기사님 계정에만** 귀속되도록 강제합니다. (폰의 소유권을 다른 사람에게 넘기려면 먼저 기존 계정에서 삭제 후 재등록)

**👉 동의하시나요?**

---

### Q3. `touchDeviceSession`에서 `deviceName` 자동 조회

현재 `devices.ts`의 `touchDeviceSession()` 함수가 메모리에 새 `DeviceSession`을 만들 때 `deviceName` 없이 생성합니다. 

**제 방침:** 새 세션 생성 시점에만 1회 DB 조회(`SELECT device_name FROM user_devices WHERE device_id = ?`)를 수행하여 `deviceName`을 메모리에 캐싱합니다. 이후 하트비트마다 매번 DB를 치는 것은 아닙니다.

**👉 동의하시나요?**

---

### Q4. 기존 소켓 브로드캐스트(`io.emit`) 범위 조정

현재 `socketHandlers.ts` 132번 라인에서 **모든 접속자에게** 전체 기기 목록을 1초마다 뿌리고 있습니다:
```typescript
io.emit("telemetry-devices", getActiveDevicesSnapshot());
```
SaaS 환경에서는 내 기기만 보여야 하므로, 이것을 유저별 룸(`io.to(userId)`)으로 바꿔야 합니다.

**제 방침:** 이번 작업의 범위에는 포함하지 않고, 현재 MVP 단계에서는 그대로 둡니다. (향후 SaaS 멀티테넌트 완성 시 별도 태스크로 분리)

**👉 동의하시나요?**

---

### Q5. SettingsModal 탭 구조의 UI 톤

현재 `SettingsModal.tsx`는 심플한 단일 폼입니다. 여기에 탭을 추가하면 하단의 `[저장하기]`, `[취소]` 버튼 배치가 바뀌어야 합니다.

**제 방침:** 
- `[기본 설정]` 탭: 현재 차량 종류/경로 옵션 + 저장 버튼 (기존과 동일)
- `[기기 관리]` 탭: 기기 리스트 + 이름 수정(인라인 저장) + 삭제 + `[새 기기 연동]` 버튼
- 탭 전환 시 저장하지 않은 변경 사항은 경고 없이 버립니다 (각 탭이 독립적이므로)

**👉 동의하시나요?**

---

## Verification Plan

### 웹 UI 테스트
1. `SettingsModal` → `[기기 관리]` 탭 → 빈 리스트 확인
2. `[새 기기 연동]` 클릭 → 6자리 PIN + 카운트다운 타이머 확인
3. 3분 경과 시 "만료됨" 표시 전환 확인

### 서버 API 테스트 (curl)
```bash
# 1. PIN 발급 (웹 로그인 상태)
curl -X POST http://localhost:4000/api/devices/pin \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json"

# 2. 앱에서 페어링 (인증 불필요)
curl -X POST http://localhost:4000/api/devices/pair \
  -H "Content-Type: application/json" \
  -d '{"pin":"123456","deviceId":"test-uuid-001","deviceName":"테스트폰"}'

# 3. 미등록 기기로 scrap 호출 시 401 확인
curl -X POST http://localhost:4000/api/devices/pair \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"fake-unknown-device","data":[]}'
```

### 종합 시나리오
1. 웹에서 PIN 발급 → curl로 pair 호출 → 웹 팝업 자동 닫힘 + 기기 리스트 즉시 갱신 (소켓 동기화)
2. 등록된 deviceId로 scrap 호출 → 200 정상 응답
3. 미등록 deviceId로 scrap 호출 → 401 차단 확인
