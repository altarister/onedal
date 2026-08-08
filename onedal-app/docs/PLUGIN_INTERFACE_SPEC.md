# 🧩 1DAL 플러그인 인터페이스 명세

> **문서 상태**: v2.0 — **2026-08-09 실제 소스에서 추출해 재작성**
> **목적**: 다중 배차앱(인성콜, 화물24시 등)을 지원하기 위한 확장 지점 정의

> [!IMPORTANT]
> **v1.0 문서의 인터페이스는 실재하지 않았습니다.**
> `BaseScrapParser`, `BaseAutomationEngine`, `extractOrdersFromList()`, `parseDetailed()` —
> 모두 코드에 없는 것이었고, 이 문서를 보고 플러그인을 만들면 **컴파일조차 되지 않았습니다.**
> 아래는 전부 실제 소스에서 그대로 옮긴 것입니다.

---

## 1. 앱 측 파서 — `IScrapParser`

**패키지**: `com.onedal.app.core` (v1.0 문서의 `core.engine`이 아닙니다)

```kotlin
package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder

interface IScrapParser {

    /** 텍스트 리스트를 파싱하여 SimplifiedOfficeOrder 객체로 변환 */
    fun parse(texts: List<String>): SimplifiedOfficeOrder

    /** 파싱된 오더가 4대 필터 조건을 모두 만족하는지 판정 */
    fun shouldClick(order: SimplifiedOfficeOrder): Boolean

    /** rawText에서 상차지 직선거리(숫자)만 파싱 */
    fun parsePickupDistance(rawText: String): Double?

    /**
     * 리스트 화면의 전체 텍스트 노드들을 콜(Card/Row) 단위로 묶는다.
     * @return (요금 노드 = 클릭 대상, 그 콜을 구성하는 전체 텍스트) 쌍의 리스트
     */
    fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>>
}
```

> v1.0 문서와 다른 점
> - 이름: `BaseScrapParser` → **`IScrapParser`**
> - `extractOrdersFromList(nodes): List<Pair<Order, Node>>` → **`groupListNodes(nodes): List<Pair<Node, List<String>>>`**
>   (이름·반환 타입·Pair 순서가 모두 다릅니다)
> - `parseDetailed()` — **없습니다.** 상세 파싱은 **서버**의 `utils/parser.ts`가 합니다
> - `parsePickupDistance()` — 실재하는데 v1.0 문서엔 없었습니다

**구현체**: `plugins/insung/InsungParser.kt`, `plugins/hwamul24/Hwamul24Parser.kt`
**라우터**: `core/ScrapParser.kt` — `targetApp` 문자열로 위임 대상을 고릅니다

```kotlin
private val delegate: IScrapParser = when (targetApp) {
    "24시"  -> Hwamul24Parser(context)
    "인성콜" -> InsungParser(context)
    else    -> InsungParser(context)
}
```

---

## 2. 화면 판별 — `ScreenKeywords`

자동화 엔진을 인터페이스로 추상화하는 대신, **키워드 사전을 데이터로 주입**하는 방식입니다.
(`BaseAutomationEngine` 같은 인터페이스는 존재하지 않습니다)

```kotlin
data class ScreenKeywords(
    val listRequired: List<String>,          // 신규 리스트 (all 일치)
    val completedListRequired: List<String>, // 완료 리스트 (all)
    val detailKeywords: List<String>,        // 상세 페이지 (all)
    val confirmKeywords: List<String>,       // 있으면 "배차 전" (any)
    val pickupKeywords: List<String>,        // 출발지 팝업 (any)
    val dropoffKeywords: List<String>,       // 도착지 팝업 (any)
    val memoKeywords: List<String>,          // 적요 팝업 (all)
    val errorKeywords: List<String>,         // 에러 팝업 (any)
    val loadingKeywords: List<String>,       // 로딩 (any, 감지 시 무시)
    val appLabel: String = "배차앱",
    val cancelKeyword: String = "취소"
)
```

`ScreenDetector.detect()`가 **고정된 우선순위**로 판별합니다.

```
1 errorKeywords    (any)
2 pickupKeywords   (any)
3 dropoffKeywords  (any)
4 memoKeywords     (all)
5 detailKeywords   (all)  → confirmKeywords 유무로 PRE_CONFIRM / CONFIRMED 구분
6 listRequired     (all)
7 completedListRequired (all)
8 UNKNOWN
```

> 🔴 **알려진 한계 — 화물24시가 동작하지 않는 원인**
> 이 우선순위가 앱마다 고정입니다. 화물24시는 **상세 화면에 "상차지"가 나오는데**
> 그 단어가 우선순위 2(`pickupKeywords`)에 들어 있어, 상세 화면이 `POPUP_PICKUP`으로 판별됩니다.
> 우선순위 5까지 내려가지 못해 `DETAIL_PRE_CONFIRM`이 절대 발생하지 않고,
> 결과적으로 배차신청 버튼을 누르는 핸들러가 한 번도 실행되지 않습니다.
> → 우선순위를 `ScreenKeywords`에 데이터로 포함시키거나 앱별 `ScreenDetector`가 필요합니다. todo.md Phase 5

---

## 3. 터치 실행 — `AutoTouchManager` (구상 클래스)

```kotlin
class AutoTouchManager(service: AccessibilityService) {
    fun performSimulatedTouch(node: AccessibilityNodeInfo): Boolean
    fun findAndClickByText(rootNode: AccessibilityNodeInfo?, targetText: String,
                           isStartsWith: Boolean = false): Boolean
    fun performBack(): Boolean
}
```

## 4. 팝업 서핑 — `PopupSurfingMachine` (구상 클래스)

```kotlin
class PopupSurfingMachine(touchManager: AutoTouchManager) {
    fun startSurfing(rootNode, session, screenTexts)
    fun clickPickup(rootNode)
    fun clickDropoff(rootNode)
    fun handleMemoPopup(rootNode, session, screenTexts)
    fun handlePickupPopup(rootNode, session, screenTexts)
    fun handleDropoffPopup(rootNode, session, screenTexts): Boolean
}
```
상태는 `SessionManager.SurfingState`가 들고 있습니다:
`IDLE → WAITING_FOR_MEMO_POPUP → WAITING_FOR_PICKUP_POPUP → WAITING_FOR_DROPOFF_POPUP → DONE`

> 🔴 이 두 클래스는 인터페이스가 아니며, `HijackService`가 인성콜 전용 문자열
> (`"닫기"`, `"취소"`, `"전화1"`, `"도착지"`)을 직접 넘깁니다. 앱별 분기가 없습니다.

---

## 5. 서버 측 플러그인 — `IAppPlugin`

**패키지**: `server/src/core/plugins/IAppPlugin.ts`

```typescript
export interface IAppPlugin {
    readonly appId: string;

    /** 앱마다 다른 주소 표기를 카카오 API가 인식할 형태로 정규화 */
    normalizeAddress(rawAddress: string): string;

    /** DB(places)에 저장할 장소명 정규화 */
    normalizePlaceName(rawName: string): string;

    /** 수수료 선공제 여부 등 앱별 요율 보정 */
    applyPricingExceptions(actualFare: number, fairPrice: number, minAcceptable: number): AdjustedPricing;

    /** 앱 고유 블랙리스트·특수 룰 검사. 반환값은 거절 사유 배열 */
    evaluateCustomRules(rawText: string): string[];
}
```

`PluginFactory.getPlugin(targetApp)`이 `'hwamul24'` / `'insung'`(기본)으로 분기합니다.
`targetApp`은 앱이 `/api/scrap`, `/api/orders/confirm`, `/api/orders/detail` 페이로드에 실어 보냅니다.

**구현 차이 예시**

| | InsungPlugin | Hwamul24Plugin |
|---|---|---|
| `normalizeAddress` | 끝의 `(건물명)` 제거 | 콤마 뒤 상세주소 절단 |
| `normalizePlaceName` | `(주)`·`주식회사`·공백 제거 | 대괄호 `[...]` 제거 |
| `applyPricingExceptions` | 보정 없음 | ×1.15 (수수료 선공제 가정) |

> ⚠️ `dispatchEngine.ts`에 `normalizePlaceName`이 별도로 구현되어 있고 플러그인의 것을 쓰지 않습니다.
> 일원화 필요. → todo.md Phase 3(J)

---

## 6. 새 배차앱 추가 절차

1. `app/plugins/{app}/{App}Parser.kt` — `IScrapParser` 구현
2. `app/plugins/{app}/{App}Keywords.kt` — `ScreenKeywords` 정의
   - ⚠️ 판별 우선순위 충돌을 반드시 검토할 것 (§2의 화물24시 사례)
3. `core/ScrapParser.kt`의 `when`에 분기 추가
4. `server/core/plugins/{app}/{App}Plugin.ts` — `IAppPlugin` 구현
5. `PluginFactory.getPlugin()`에 `case` 추가
6. `server/config/keywords_{app}.json` — UI 노이즈 단어 사전
7. ⚠️ **현재는 이것만으로 부족합니다.** `HijackService`의 인성콜 하드코딩 4곳을
   `keywords.*`로 이관해야 판결 집행까지 동작합니다. → todo.md Phase 5
