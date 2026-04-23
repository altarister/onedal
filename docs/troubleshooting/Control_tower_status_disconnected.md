# 관제탑 상태 분리: "지금 보고 있는 화면" vs "서버 대기 중"

## 문제가 뭐였나?

앱이 서버한테 보내는 상태값이 **딱 하나**밖에 없었습니다: `screenContext` (화면 상태)

그래서 이런 일이 벌어졌습니다:

| 시간 | 폰 실제 화면 | 서버가 받은 값 | 왜? |
|---|---|---|---|
| 19:11:16.780 | 도착지 팝업 | `POPUP_DROPOFF` ✅ | 정상 |
| 19:11:16.833 | **확정 페이지** (닫기 눌러서 돌아옴) | `POPUP_DROPOFF` ❌ | 앱이 화면을 안 읽고 보냄 |

## 어떻게 고칠 건가?

앱이 서버에 보내는 정보를 **2개로 분리**합니다:

```
기존: { screenContext: "POPUP_DROPOFF" }  ← 이거 하나로 모든 걸 표현하려다 꼬임

변경: { screenContext: "DETAIL_CONFIRMED",  ← 1. 지금 눈에 보이는 화면 (항상 갱신)
        isHolding: true,                    ← 2. 콜 처리 중인지 (별도 관리)
        lat: 37.4563, lng: 127.0432 }       ← 3. 차량(앱폰) GPS 위치 (공짜 배달)
```

> [!TIP]
> **비유하면 이렇습니다:**
> - `screenContext` = **"지금 눈에 뭐 보여?"** → 눈은 항상 떠 있음
> - `isHolding` = **"지금 콜 잡고 처리하는 중이야?"** → 사냥 가능/불가능 상태

---

## 기사님 질문 1: 팝업 열고 닫을 때마다 서버에 보내고 있는 건가?

**네, 맞습니다.** 단, **화면이 실제로 바뀔 때만** 보냅니다.

```kotlin
// updateScreenContext() 내부 조건:
if (현재화면 != 새화면) {    // 화면이 진짜 달라졌을 때만!
    현재화면 = 새화면
    POST /api/scrap 전송    // screenContext를 실어서 보냄
}
```

서핑 중 실제 전송 흐름:

| 순서 | 화면 변화 | screenContext | 보내는 데이터(콜 목록) | API |
|---|---|---|---|---|
| 1 | 확정 페이지 진입 | `DETAIL_CONFIRMED` | `data: []` (빈 배열) | `POST /api/scrap` |
| 2 | 적요상세 팝업 열림 | `POPUP_MEMO` | `data: []` | `POST /api/scrap` |
| 3 | 적요상세 닫힘 | `DETAIL_CONFIRMED` | `data: []` | `POST /api/scrap` |
| 4 | 출발지 팝업 열림 | `POPUP_PICKUP` | `data: []` | `POST /api/scrap` |
| 5 | 출발지 닫힘 | `DETAIL_CONFIRMED` | `data: []` | `POST /api/scrap` |
| 6 | 도착지 팝업 열림 | `POPUP_DROPOFF` | `data: []` | `POST /api/scrap` |
| 7 | **도착지 닫힘** | **원래는 여기서 `DETAIL_CONFIRMED`로 바뀌어야 하는데, 앱이 화면 읽기를 건너뛰어서 과거값(`POPUP_DROPOFF`)이 그대로 남음** ❌ | | |

기사님이 궁금했던 부분:
> "적요상세, 출발지, 도착지를 한번에 뽑아서 POST /api/orders/detail로 보내고 있는데, 그럴 필요없이 그냥 매번 보내고 있으니 그걸로 보내는 것이 맞는거야?"

**이건 서로 다른 데이터입니다:**

| API | 뭘 보내나 | 언제 보내나 |
|---|---|---|
| `POST /api/scrap` | 화면 상태(`screenContext`) + 리스트 콜들(`data[]`) | 화면이 바뀔 때마다 (서핑 중엔 빈 배열) |
| `POST /api/orders/detail` | **팝업에서 긁어온 실제 텍스트** (적요 내용, 출발지 주소, 도착지 주소 등) | 서핑이 **완전히 끝난 후 딱 1번** |

서핑 도중 `/api/scrap`이 보내지는 건 팝업 데이터를 보내는 게 아니라,
단지 **"지금 이 폰이 어떤 화면에 있는지"** 상태값만 실어 보내는 겁니다.
팝업에서 긁은 실제 텍스트 데이터는 앱 메모리(`accumulatedDetailText`)에 쌓아두었다가
도착지 팝업이 닫힌 후 `/api/orders/detail` 한 방에 보냅니다.

> [!NOTE]
> **정리하면:** `/api/scrap`은 **"나 살아있고 지금 이 화면이야"** 라는 신호, 
> `/api/orders/detail`은 **"여기 긁어온 실제 데이터야, 판결해줘"** 라는 업무 보고입니다.
> 같은 타이밍에 보내지지만 역할이 다릅니다.

---

## 기사님 질문 2: "막혔다"는 건 서버가 scrap을 안 받은 건가?

**아닙니다!** 서버는 scrap을 정상적으로 받았습니다.

문제는 **앱 쪽**에서 생긴 겁니다:

```
[원래 코드 순서]

화면 이벤트 발생!
   ↓
❌ if (서버판정대기중) → return   ← 여기서 함수를 빠져나가 버림
   ↓ (도달 못함)
화면 읽기 (detectScreenContext)
   ↓ (도달 못함)
화면 상태 업데이트 (updateScreenContext)
```

서버 판정 대기(데스밸리) 중이라서 **앱이 화면을 안 읽어버린 겁니다.**
결과적으로 `currentScreenContext`가 옛날 값(`POPUP_DROPOFF`)에 멈춰 있었고,
60초 하트비트로 scrap이 보내질 때 이 **과거 화면 값**이 그대로 서버에 전달된 것입니다.

서버는 받은 대로 충실히 저장했을 뿐이고, 대시보드는 그 값을 그대로 보여준 것이죠.

**한 줄 요약**: 서버가 scrap을 안 받은 게 아니라, 앱이 **틀린 값을 보낸 것**입니다.

---

## 기사님 질문 3: isHolding은 확정 클릭 때부터 true 아닌가?

**기사님 말이 맞습니다!** 제가 처음에 "데스밸리 시작 때만 true"라고 했던 건 너무 좁게 본 겁니다.

기사님이 말씀하신 원래 기획 의도를 정리하면:

> scrap의 본래 목적은 **리스트에서 버려지는 콜을 수집하는 것**.
> 확정을 눌러서 리스트를 떠나면, 리스트로 돌아올 때까지 콜 수집이 불가능하다.

이걸 `isHolding`으로 표현하면:

```
리스트 화면 (사냥 모드)
  isHolding = false    ← "나 지금 콜 수집 가능해"
  data: [콜1, 콜2, ...]  ← 버려진 콜들 전송

확정 버튼 클릭! (POST /api/orders/confirm)
  isHolding = true     ← "나 지금 콜 잡고 처리 중이야"
  data: []              ← 리스트에 없으니 빈 배열

서핑 (적요상세 → 출발지 → 도착지)
  isHolding = true     ← 여전히 처리 중
  
서버 판결 대기 (데스밸리)
  isHolding = true     ← 여전히 처리 중

서버 판결 완료 → 리스트 복귀
  isHolding = false    ← "처리 끝, 다시 사냥 가능"
```

코드에서 보면, 이미 `isDetailScrapSent`라는 변수가 **정확히 이 역할**을 하고 있습니다:

```kotlin
// HijackService.kt 351번 줄
apiClient.sendConfirm(request)   // POST /api/orders/confirm
isDetailScrapSent = true         // ← 이 시점부터 "처리 중"

// resetSessionState() 에서
isDetailScrapSent = false        // ← 리스트 복귀 시 "사냥 모드"
```

**따라서 `isHolding`은 `isDetailScrapSent`와 동기화**시키면 됩니다.
데스밸리 시작/끝에만 바꾸는 게 아니라, **확정 클릭부터 리스트 복귀까지** true입니다.

> [!IMPORTANT]
> **isHolding이 바뀌는 순간 (수정된 설계):**
> - `true` ← 확정 클릭 (POST /api/orders/confirm 전송 시점)  
> - `false` ← 리스트 화면 복귀 (resetSessionState 호출 시점)
> 
> 이 두 시점에 `forceFlushEvent()`로 scrap을 즉시 쏴서 서버에 알립니다.

---

## 기사님 질문 4: "관심사 분리는 좋은데 해법이 안 떠오른다"

기사님이 고민하신 건 이겁니다:

> scrap은 원래 **버린 콜 수집**용인데,
> 지금은 **디바이스 상태 보고**까지 겸하고 있다.
> isHolding까지 넣으면 scrap이 너무 많은 일을 하는 거 아닌가?

**시니어 관점에서의 판단: 이대로 가는 게 맞습니다.**

이유:

```
[Option A] 새 API를 하나 더 만든다?
POST /api/devices/:id/status  ← 순수 상태 보고 전용
POST /api/scrap               ← 순수 콜 수집 전용

→ 문제: 앱이 API를 2개 호출해야 해서 배터리·통신 비용 2배
→ 문제: 서버도 세션 관리 코드가 분산됨
→ 판정: ❌ 과잉 설계
```

```
[Option B] 기존 scrap에 isHolding 필드만 추가한다
POST /api/scrap  ← { data: [...], screenContext: "...", isHolding: true/false }

→ 장점: API 호출 횟수 변화 없음 (이미 보내고 있던 것에 필드 1개 추가)
→ 장점: 서버에서 touchDeviceSession() 한 곳에서 모든 상태 관리
→ 장점: isHolding 값으로 "data 비어있는 이유"가 자연스럽게 설명됨
→ 판정: ✅ 이게 맞음
```

**배민 같은 대형 서비스에서도 "디바이스 텔레메트리"는 하나의 엔드포인트로 통합**합니다.
배달 라이더 앱이 위치·배터리·주문상태를 각각 다른 API로 보내진 않거든요.
하나의 "ping" 안에 다 실어 보내는 게 효율적입니다.

scrap이 "콜 수집 + 상태 보고"를 겸하는 건 **문제가 아니라 효율**입니다.
이름만 좀 어색할 뿐, 실질적으로는 "디바이스 텔레메트리 엔드포인트"로 잘 쓰이고 있습니다.

---

## 기사님 질문 5: 서핑 중에도 계속 보내는 건 맞지?

**맞습니다.** 적요상세 → 출발지 → 도착지 팝업을 열고 닫을 때마다 화면이 바뀌니까
`POST /api/scrap`이 총 6~7번 정도 보내집니다.

하지만 이건 문제가 아닙니다:
- **데이터 크기**: `{ screenContext: "POPUP_MEMO", data: [], isHolding: true, lat: 37.45, lng: 127.04 }` → 약 90바이트
- **소요 시간**: 전체 서핑이 약 1.5초 만에 끝남 (기사님 로그 기준)
- **서버 부하**: 이미 처리하고 있던 것이라 추가 비용 없음

이 덕분에 대시보드에서 서핑 진행 상황을 **실시간으로 볼 수 있는 것**이기도 합니다.
(적요 팝업 → 출발지 팝업 → 도착지 팝업 → 확정 페이지... 배지가 실시간으로 바뀌는 것)

---

## 기사님 질문 6: 1번 폰은 중복 전송 안 하지? / 2번 폰은?

### 1번 폰: 같은 화면이면 안 보냄
`if (현재화면 != 새화면)` 조건이 있어서, 확정 페이지에서 가만히 있으면 
60초 하트비트만 가고 즉시 전송은 안 일어납니다.

### 2번 폰: 완전 독립
서버의 `activeDevices` 메모리에 `deviceId`별로 완전히 분리 저장됩니다.
1번 폰의 isHolding과 2번 폰의 isHolding은 서로 간섭하지 않습니다.

2번 폰이 같은 콜을 확정 시도하면:
→ 인성앱 소켓이 "이미 배차됨" 에러 팝업을 띄움
→ 앱이 `POPUP_ERROR`로 감지
→ **[TODO]** 닫기 버튼 자동 클릭 후 리스트 복귀 (todo.md에 기록 완료)

---

## 최종 수정 파일 목록

### 1. 앱 (안드로이드)
- `ScrapPayload`에 `isHolding`, `lat`, `lng` 필드 추가
- `TelemetryManager`에 `isHolding` 변수 추가, flush 시 GPS 좌표와 함께 전송
- GPS: `LocationManager`로 마지막 위치를 가져와서 flush마다 실어 보냄 (앱폰 = 차량 거치, 위치 = 차량 위치)
- `HijackService`: 
  - 확정 클릭 시(`isDetailScrapSent = true` 시점) → `isHolding = true` + forceFlush
  - 리스트 복귀 시(`resetSessionState()`) → `isHolding = false` + forceFlush
  - 화면 읽기(`detectScreenContext`)는 **항상** 돌리고, 클릭(서핑)만 데스밸리 중 멈춤

### 2. 서버 (Node.js)
- `scrap.ts`: 앱이 보내온 `isHolding`, `lat`, `lng` 추출 → `touchDeviceSession()`에 전달
- `devices.ts`: `DeviceSession` 메모리에 `isHolding`, `lat`, `lng` 저장 및 반환

### 3. 대시보드 (웹)
- `DeviceControlPanel`: 화면 배지 + 홀드 배지 나란히 표시
- `isHolding=true`이면 노란색 `[🔒 콜 처리 중]` 배지 추가

### 4. 공통 타입
- `DeviceSession`에 `isHolding?: boolean`, `lat?: number`, `lng?: number` 추가
- `ScrapPayload` 타입에도 `lat`, `lng` 옵션 필드 추가
- `ScreenContext`에서 `WAITING_SERVER` 삭제 (홀드 상태는 isHolding으로 분리)

## 검증 방법

1. 앱에서 콜 확정 → 대시보드에 즉시 `[🔒 콜 처리 중]` 노란 배지 뜨는지 확인
2. 서핑 중 화면 배지가 팝업 이름대로 실시간 변경되는지 확인
3. 데스밸리 중에도 화면 배지가 `[확정페이지]`로 정확히 표시되는지 확인
4. 서버 판결 후 리스트 복귀 시 홀드 배지 사라지는지 확인
