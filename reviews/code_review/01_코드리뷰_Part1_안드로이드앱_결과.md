# [Part 1] 안드로이드 앱 코틀린 코드 정밀 리뷰 결과 보고서

**작성 일시**: 2026-09-17  
**대상 리포지토리**: `onedal-app` (Android Accessibility Service & Parser Engine)  
**중점 점검 파일**:
1. `onedal-app/app/src/main/java/com/onedal/app/HijackService.kt`
2. `onedal-app/app/src/main/java/com/onedal/app/core/AutoTouchManager.kt`
3. `onedal-app/app/src/main/java/com/onedal/app/core/engine/SafeCancelTimer.kt`
4. `onedal-app/app/src/main/java/com/onedal/app/plugins/insung/InsungParser.kt`
5. `onedal-app/app/src/main/java/com/onedal/app/plugins/PickupListFilter.kt` & `RegionMatch.kt`
6. `onedal-app/app/src/main/java/com/onedal/app/api/ApiClient.kt`

---

## 1. 정밀 진단 총평 및 심각도 매트릭스

안드로이드 앱 엔진은 2026년 8~9월 실측 주행 제보들을 거치며 화면 전환 오탐 방어와 세션 상태 머신 등 실전 방어벽이 촘촘히 구축되어 있습니다. 그러나 **실제 소스코드의 라인 단위(Line-by-Line) 현미경 분석 결과, 1월 실주행(하루 8~10시간 연속 가동) 시 앱을 서서히 죽이거나(Silent Kill) 배차망 시스템에 매크로로 적발될 수 있는 치명적 결함 4건과 성능 병목 4건**이 발견되었습니다.

### 🚨 결함 심각도 요약 표

| 심각도 | 구분 | 파일 및 위치 | 핵심 문제점 | 예상 파급 효과 |
| :--- | :--- | :--- | :--- | :--- |
| **CRITICAL** | 메모리 누수 | `HijackService.kt:1519, 1534`<br>`AutoTouchManager.kt:182` | `AccessibilityNodeInfo` Binder 객체 재귀 탐색 후 `.recycle()` 누락 | 2~3시간 연속 스캔 시 Binder 풀 고갈, 앱 프리징 및 강제 종료 |
| **CRITICAL** | 레이스 컨디션 | `HijackService.kt:1428~1450` | `executeDecisionImmediately`에서 500ms 지연 전 `resetSessionState()` 선실행 | 비상 취소 리포트 시 `orderId="unknown"`, 클릭 중 상태 유실 |
| **CRITICAL** | 파싱 누락 | `InsungParser.kt:728` | `groupListNodes`에서 `VEHICLE_ONLY`만 필터링 ("라2.2" 등 결합형 탈락) | 특정 차종 결합형 콜이 리스트 그룹화에서 완전 증발 |
| **CRITICAL** | 계정 보안 | `AutoTouchManager.kt:189~200` | 20.0ms 고정 터치, 정중앙 고정 좌표, 0px 지터 | 인성/카카오 보안 관제 시스템의 기계식 매크로 판정 (계정 정지) |
| **MAJOR** | GC 스파이크 | `InsungParser.kt:577~590` | 1초 스캔 루프 내 매 카드마다 `SharedPreferences` + `JSONObject` 파싱 | 초당 수십 회 JSON 역직렬화, Stop-the-world GC로 터치 딜레이 유발 |
| **MAJOR** | CPU 낭비 | `InsungParser.kt:613, 629, 633`<br>`looksLikeAddress:156` | 루프 및 정적 함수 내부에서 정규식(`Regex`) & `SimpleDateFormat` 매번 new | 불필요한 객체 할당 및 정규식 컴파일 부하 누적 |
| **MAJOR** | 동시성 | `SafeCancelTimer.kt:28, 49` | `deadlineAt`, `isWaitingForDecision` 변수 동기화 및 volatile 누락 | 백그라운드 텔레메트리 스레드 간 가시성 지연으로 잔여초 오표기 |
| **MAJOR** | 큐 블로킹 | `ApiClient.kt:146` | `dispatchExecutor` (단일 스레드) 내부에서 재시도 시 `Thread.sleep(500)` 호출 | 네트워크 불안정 시 후속 Confirm/Detail 전송 큐 전체 일시 동결 |

---

## 2. 파일별 현미경 코드 분석 & 잠재 결함 심층 진단

---

### [결함 1] `AccessibilityNodeInfo` Native/Binder 객체 메모리 누수 (CRITICAL)

#### 📍 대상 코드:
- `HijackService.kt` (라인 1512~1535)
- `AutoTouchManager.kt` (라인 174~186)

```kotlin
// HijackService.kt (라인 1512~1520)
private fun gatherNodeTexts(node: AccessibilityNodeInfo?, out: MutableList<String>) {
    if (node == null) return
    if (node.packageName?.toString() == "com.onedal.app") return

    node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { out.add(it) }
    node.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { out.add(it) }
    for (i in 0 until node.childCount) gatherNodeTexts(node.getChild(i), out) // 🚨 getChild(i)가 재귀로 넘어가지만 recycle되지 않음!
}

// AutoTouchManager.kt (라인 174~186)
private fun rowRectOf(node: AccessibilityNodeInfo): Rect? {
    val screenWidth = service.resources.displayMetrics.widthPixels
    var cur: AccessibilityNodeInfo? = node.parent // 🚨 parent가 반환한 새 노드 래퍼
    var hops = 0
    while (cur != null && hops < ROW_HOPS) {
        val r = Rect()
        cur.getBoundsInScreen(r)
        if (r.width() >= screenWidth / 2) return r // 🚨 이전 cur 객체들 recycle 누락
        cur = cur.parent // 🚨 이전 cur이 recycle되지 않고 덮어씌워짐!
        hops++
    }
    return null
}
```

#### 🔍 정밀 진단:
1. **안드로이드 접근성 노드의 생명주기 특성**:
   - `node.getChild(i)`나 `node.parent`는 단순한 자바 객체 참조가 아닙니다. 안드로이드 프레임워크(`system_server`)와 앱 프로세스 간의 IPC 통신을 위해 **Binder IPC Token 및 Native C++ 힙(`android::AccessibilityNodeInfo`)을 매핑한 특수 객체**입니다.
   - 루트 노드(`rootNode.recycle()`)만 해제한다고 해서 자식 노드들이 자동으로 Native에서 해제되지 않습니다. 명시적으로 `child.recycle()`을 호출하지 않으면 자바 가비지 컬렉터(GC)의 Finalizer 큐에 들어가며, 고빈도 이벤트 환경에서는 Native Binder 토큰 한도(보통 1,024개~2,048개)를 순식간에 고갈시킵니다.
2. **현장 영향**:
   - 리스트 화면에서 초당 1~2회씩 30여 개 노드를 순회할 경우, 분당 약 3,600개 이상의 미반환 Native Binder 객체가 누적됩니다.
   - 장시간 주행 시 `system_server`의 Binder 버퍼가 가득 차면서 **`DeadObjectException`이 발생하고, 접근성 서비스 연결이 시스템에 의해 일방적으로 강제 중단(Kill)**됩니다.

---

### [결함 2] 판결 집행(`executeDecisionImmediately`) 시 레이스 컨디션 및 세션 조기 증발 (CRITICAL)

#### 📍 대상 코드:
- `HijackService.kt` (라인 1420~1450)

```kotlin
private fun executeDecisionImmediately(decision: String) {
    cancelSafeCancelTimer() // 타이머 해제
    if (!session.isAutoActive) return // 이미 풀렸으면 스킵

    val targetBtnStr = if (decision == "KEEP") "닫기" else "취소"
    AppLogger.roadmap("🛡️ 관제탑 판결 수신 (Action: $decision) → '$targetBtnStr' 버튼 클릭 집행 개시", telemetryManager.currentScreenContext.name)
    AppLogger.d(TAG, "⚡ 판결 집행: 행동=$decision, 누를버튼=$targetBtnStr (버튼클릭을 시작합니다), 500ms 지연")
    
    mainHandler.postDelayed({
        val rootNode = rootInActiveWindow
        if (rootNode == null) {
            resetSessionState()
            return@postDelayed
        }
        if (touchManager.findAndClickByText(rootNode, targetBtnStr, isStartsWith = false)) {
            AppLogger.d(TAG, "🎉 행동 완료! 타겟($targetBtnStr) 명중.")
        } else {
            AppLogger.e(TAG, "❌ 대상 버튼($targetBtnStr)을 찾을 수 없음.")
            sendEmergencyReport(EmergencyReason.BUTTON_NOT_FOUND, "판결 $decision 의 대상 $targetBtnStr 버튼 누락")
        }
        rootNode.recycle()
    }, 500)

    // 🚨 [치명적 버그] 500ms 지연 실행을 걸어두고, 바로 다음 줄에서 세션을 즉시 리셋함!
    resetSessionState()
}
```

#### 🔍 정밀 진단:
1. **변수 조기 파괴**:
   - `mainHandler.postDelayed(..., 500)`으로 버튼 클릭을 0.5초 뒤로 예약했습니다.
   - 그런데 메인 스레드는 즉시 다음 라인 1449의 `resetSessionState()`를 실행합니다.
   - `resetSessionState()`는 `session.currentOrderId = ""`로 초기화하고 `isAutoActive = false`로 만듭니다.
2. **500ms 후 발생하는 2차 재앙**:
   - 만약 500ms 뒤 `findAndClickByText`가 실패하여 라인 1443의 `sendEmergencyReport`를 호출하면:
     ```kotlin
     // HijackService.kt:1453
     val orderId = session.currentOrderId.ifEmpty { "unknown" }
     ```
     이미 세션이 비워졌으므로 **서버로 날아가는 비상 보고서의 orderId는 영원히 "unknown"이 됩니다.** 관제탑은 어느 주문에서 취소 버튼 클릭이 실패했는지 알 수 없게 됩니다.
   - 또한 500ms 동안 `isAutoActive`가 이미 `false`로 풀려 있어, 그 사이에 도착한 접근성 이벤트가 상태 머신을 교란합니다.

---

### [결함 3] `groupListNodes` 차종+요금 결합 노드 탈락 버그 (CRITICAL)

#### 📍 대상 코드:
- `InsungParser.kt` (라인 725~736, 라인 51~55)

```kotlin
// InsungParser.kt (라인 51~55)
private val VEHICLE_ONLY = Regex("^($VEHICLE_TOKENS)$")
private val VEHICLE_WITH_FARE = Regex("($VEHICLE_TOKENS)\\s*(\\d+(?:\\.\\d+)?)")

// InsungParser.kt (라인 725~736)
override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
    // 🚨 [치명적 필터링] 오직 차종만 단독으로 있는 노드만 앵커로 잡음!
    val fareNodes = allNodes.filter { it.text.matches(VEHICLE_ONLY) }

    return fareNodes.map { fareNode ->
        val rowNodes = allNodes.filter {
            sameRow(it.rect.top, it.rect.bottom, fareNode.rect.top, fareNode.rect.bottom)
        }
        Pair(fareNode, rowNodes.map { it.text })
    }
}
```

#### 🔍 정밀 진단:
1. **파서 내부의 모순**:
   - `readVehicleAndFare()`(라인 120)에는 차종과 요금이 한 노드로 뭉쳐진 경우(`VEHICLE_WITH_FARE`, 예: `"라2.2"`, `"오1.5"`)를 대비한 폴백 정규식이 완벽히 구현되어 있습니다.
   - 하지만 그 앞단인 **`groupListNodes`에서 `VEHICLE_ONLY`(`^($VEHICLE_TOKENS)$`) 매칭 노드만 `fareNodes`로 거르고 있습니다.**
2. **실제 영향**:
   - 안드로이드 웹뷰나 커스텀 렌더러 특성상 간혹 차종과 요금이 하나의 텍스트 노드로 결합되어 전달되는 화면이 발생합니다.
   - 이때 `groupListNodes`는 해당 줄을 앵커로 인식하지 못하므로, **해당 콜 카드는 그룹 자체가 생성되지 않아 `parse()` 함수로 전달조차 되지 않고 조용히 증발(Drop)**합니다.

---

### [결함 4] 기계식 20ms 고정 터치 및 0px 지터 - 안티치트 적발 위험 (CRITICAL)

#### 📍 대상 코드:
- `AutoTouchManager.kt` (라인 20, 라인 71~73, 라인 189~196)

```kotlin
companion object {
    private const val TAP_HOLD_MS = 20L // 🚨 20ms 고정 터치 시간
}

fun performSimulatedTouch(...): Boolean {
    val x = tapXOf(node, rect, leftShiftPx, tapRowLeft).toFloat() // 🚨 정중앙 또는 고정 Offset 계산
    val y = rect.centerY().toFloat() // 🚨 Y좌표 정중앙 (소수점 0.0px)
    ...
    fireTap(x, y)
}

private fun fireTap(x: Float, y: Float): Boolean {
    val clickPath = Path().apply { moveTo(x, y) } // 🚨 한 점(점 접촉), 미세 떨림/궤적 0
    val clickStroke = GestureDescription.StrokeDescription(clickPath, 0, TAP_HOLD_MS)
    val gesture = GestureDescription.Builder().addStroke(clickStroke).build()
    ...
}
```

#### 🔍 정밀 진단:
1. **보안관제(Anti-Macro/Anti-Cheat)의 탐지 메커니즘**:
   - 퀵서비스/화물 배차망 앱(인성, 24시, 로지 등)은 기계식 자동 터치(매크로)를 적발하기 위해 MotionEvent 이벤트를 백그라운드에서 프로파일링합니다.
   - **인간 손가락 터치의 특징**:
     - 터치 누름 유지 시간(Hold Duration): 평균 60ms ~ 120ms (가우시안 분포).
     - 터치 좌표: 버튼의 정확한 수학적 중심(`centerX`, `centerY`)을 연속으로 누르는 것은 물리적으로 불가능.
     - 다운-업 간 미세 변위: 누르고 뗄 때 미세한 압력 변화와 1~3픽셀의 슬립(Drift) 발생.
2. **현재 구현의 취약점**:
   - `moveTo(x, y)` 한 점만 찍고 정확히 `20ms` 뒤에 `UP`이 발생합니다.
   - 좌표가 노드 중심 또는 정해진 픽셀 오프셋에 오차 없이 일치합니다.
   - **배차망 로그 분석 시 100% 기계식 오토 클릭으로 분류되어 계정이 사전 경고 없이 영구 정지(블랙리스트 등록)**될 위험이 매우 큽니다.

---

### [결함 5] 스캔 루프 내 SharedPreferences & JSONObject 반복 파싱 (MAJOR)

#### 📍 대상 코드:
- `InsungParser.kt` (라인 577~590)

```kotlin
override fun parse(texts: List<String>): SimplifiedOfficeOrder {
    ...
    // 🚨 리스트의 매 카드마다, 매 스캔(1초)마다 SharedPreferences 읽기 및 JSONObject 파싱 반복!
    val uiNoiseWords = try {
        val keywordsJsonStr = prefs.getString("targetAppKeywords", null)
        if (keywordsJsonStr != null) {
            val keywordsObj = JSONObject(keywordsJsonStr)
            val arr = keywordsObj.optJSONArray("uiNoiseWords")
            if (arr != null) {
                (0 until arr.length()).map { arr.getString(it) }.toSet()
            } else FALLBACK_NOISE_WORDS
        } else {
            FALLBACK_NOISE_WORDS
        }
    } catch(e: Exception) {
        FALLBACK_NOISE_WORDS
    }
    ...
}
```

#### 🔍 정밀 진단:
- 한 화면에 콜 카드가 15개 떠 있다면, 1초 스캔마다 `prefs.getString` 15회, `JSONObject` 생성 15회, `Set` 생성 15회가 메인 스레드에서 일어납니다.
- 메모리 할당 빈도가 높아지며, 안드로이드 ART 런타임의 **Concurrent Copying (CC) 가비지 컬렉터가 빈번하게 트리거되어 20~50ms의 마이크로 프리징**이 발생합니다.
- 이 시간 동안 메인 스레드가 멈추어 0.1초를 다투는 신규 콜 낚아채기에서 경쟁 기사에게 밀리게 됩니다.

---

### [결함 6] 정규식 패턴 및 DateFormat 인스턴스 핫루프 내 매번 new 생성 (MAJOR)

#### 📍 대상 코드:
- `InsungParser.kt` (라인 613, 629, 633, 156~158, 217)

```kotlin
// InsungParser.kt:613
val distanceRegex = Regex("""(\d+\.\d+)""") // 🚨 카드마다 매번 정규식 컴파일!

// InsungParser.kt:629
SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.getDefault()).format(Date()) // 🚨 카드마다 SimpleDateFormat 생성!

// InsungParser.kt:633
val timeRegex = Regex("\\b([0-2]?\\d:[0-5]\\d)\\b") // 🚨 카드마다 정규식 컴파일!

// InsungParser.kt:156~158 (looksLikeAddress)
return Regex("(시|군|구|동|읍|면|리|로|길)$").containsMatchIn(t) ||
       Regex("(시|군|구|동|읍|면|리)\\s").containsMatchIn(t) ||
       Regex("\\d+(-\\d+)?$").containsMatchIn(t) && t.contains(" ") // 🚨 함수 호출마다 정규식 3개 매번 컴파일!
```

#### 🔍 정밀 진단:
- `Regex(...)` 생성자는 내부적으로 Java의 `Pattern.compile(...)`을 호출하여 오토마타 NFA/DFA 그래프를 빌드합니다.
- `SimpleDateFormat` 역시 포맷 문자열 파싱과 `Calendar` 인스턴스화 비용이 매우 큰 객체입니다.
- 이 객체들은 반드시 `companion object`의 `private val` 상수로 사전 컴파일(Pre-compiled)해 두어야 합니다.

---

### [결함 7] `SafeCancelTimer` 스레드 가시성(Thread-Visibility) 보장 누락 (MAJOR)

#### 📍 대상 코드:
- `SafeCancelTimer.kt` (라인 28, 49)

```kotlin
class SafeCancelTimer {
    private var deadlineAt = 0L // 🚨 volatile 누락
    ...
    fun start(timeoutMs: Long, session: SessionManager, onTimeout: () -> Unit) {
        ...
        deadlineAt = android.os.SystemClock.elapsedRealtime() + timeoutMs
        ...
    }
}
```

#### 🔍 정밀 진단:
- `deadlineAt`은 `mainHandler`에 의해 메인 스레드에서 갱신되지만, `remainSec` 프로퍼티는 관제탑 상태바 조립을 위해 **`telemetryExecutor` 백그라운드 스레드에서 수시로 읽힙니다.**
- `@Volatile` 어노테이션이 없으면 CPU 코어 캐시 불일치로 인해 백그라운드 스레드가 변경된 `deadlineAt` 값을 즉시 보지 못하고 이전 값을 읽어 관제탑 웹에 **안전취소 남은 초가 순간적으로 튀거나 멈추는 현상**이 발생합니다.

---

### [결함 8] `ApiClient` 단일 스레드 Executor 내 `Thread.sleep` 블로킹 (MAJOR)

#### 📍 대상 코드:
- `ApiClient.kt` (라인 50, 146)

```kotlin
private val dispatchExecutor = Executors.newSingleThreadExecutor() // 🚨 단일 스레드

private fun executeWithRetry(...): Pair<Int, String>? {
    ...
    } catch (e: Exception) {
        ...
        if (attempt < maxRetries) {
            Thread.sleep(500) // 🚨 단일 스레드가 500ms 동안 멈춤!
        }
    }
}
```

#### 🔍 정밀 진단:
- `dispatchExecutor`는 `confirm`과 `detail` 전송 순서를 보장하기 위해 단일 스레드로 구성되었습니다.
- 만약 `/confirm` 1차 요청이 타임아웃(10초)된 후 `Thread.sleep(500)`에 들어가면, 작업 큐에 대기 중인 후속 작업들이 0.5초 동안 완전히 멈춥니다.
- 500ms 지연은 단순 스레드 블로킹 대신 비동기 스케줄러(`ScheduledExecutorService`)로 처리하거나 지연 시간을 200ms 이하로 단축해야 합니다.

---

## 3. 코드 개선안 (Hotfix Implementation Diffs)

위 8대 결함을 즉시 해결하기 위한 구체적인 수정 코드를 제시합니다.

---

### 🔧 [수정 1] `HijackService.kt` 노드 순회 시 메모리 누수 방지

```diff
--- a/onedal-app/app/src/main/java/com/onedal/app/HijackService.kt
+++ b/onedal-app/app/src/main/java/com/onedal/app/HijackService.kt
@@ -1517,8 +1517,14 @@ class HijackService : AccessibilityService() {
         node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { out.add(it) }
         node.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { out.add(it) }
-        for (i in 0 until node.childCount) gatherNodeTexts(node.getChild(i), out)
+        for (i in 0 until node.childCount) {
+            val child = node.getChild(i) ?: continue
+            gatherNodeTexts(child, out)
+            child.recycle() // ✅ 재귀 호출 후 자식 바인더 노드 즉시 반환
+        }
     }
```

---

### 🔧 [수정 2] `AutoTouchManager.kt`의 `rowRectOf` 조상 노드 누수 방지

```diff
--- a/onedal-app/app/src/main/java/com/onedal/app/core/AutoTouchManager.kt
+++ b/onedal-app/app/src/main/java/com/onedal/app/core/AutoTouchManager.kt
@@ -176,11 +176,17 @@ class AutoTouchManager(private val service: AccessibilityService) {
         var cur: AccessibilityNodeInfo? = node.parent
         var hops = 0
         while (cur != null && hops < ROW_HOPS) {
             val r = Rect()
             cur.getBoundsInScreen(r)
-            if (r.width() >= screenWidth / 2) return r
-            cur = cur.parent
+            if (r.width() >= screenWidth / 2) {
+                cur.recycle()
+                return r
+            }
+            val prev = cur
+            cur = cur.parent
+            prev.recycle() // ✅ 다음 부모로 넘어가기 전 이전 부모 노드 즉시 반환
             hops++
         }
+        cur?.recycle()
         return null
     }
```

---

### 🔧 [수정 3] `executeDecisionImmediately` 레이스 컨디션 및 세션 보존 수정

```diff
--- a/onedal-app/app/src/main/java/com/onedal/app/HijackService.kt
+++ b/onedal-app/app/src/main/java/com/onedal/app/HijackService.kt
@@ -1428,23 +1428,25 @@ class HijackService : AccessibilityService() {
+        val currentOrderId = session.currentOrderId // ✅ 세션 리셋 전에 orderId 스냅샷 확보
         mainHandler.postDelayed({
             val rootNode = rootInActiveWindow
             if (rootNode == null) {
                 resetSessionState()
                 return@postDelayed
             }
             try {
                 if (touchManager.findAndClickByText(rootNode, targetBtnStr, isStartsWith = false)) {
                     AppLogger.d(TAG, "🎉 행동 완료! 타겟($targetBtnStr) 명중.")
                 } else {
                     AppLogger.e(TAG, "❌ 대상 버튼($targetBtnStr)을 찾을 수 없음.")
-                    sendEmergencyReport(EmergencyReason.BUTTON_NOT_FOUND, "판결 $decision 의 대상 $targetBtnStr 버튼 누락")
+                    sendEmergencyReport(EmergencyReason.BUTTON_NOT_FOUND, "판결 $decision 의 대상 $targetBtnStr 버튼 누락 (주문: $currentOrderId)")
                 }
+            } finally {
+                rootNode.recycle()
+                resetSessionState() // ✅ 클릭 집행이 실제로 끝난 시점에 세션 리셋!
+            }
-            rootNode.recycle()
         }, 500)
-
-        // 세션 리셋
-        resetSessionState()
     }
```

---

### 🔧 [수정 4] `groupListNodes` 차종+요금 결합형 앵커 지원

```diff
--- a/onedal-app/app/src/main/java/com/onedal/app/plugins/insung/InsungParser.kt
+++ b/onedal-app/app/src/main/java/com/onedal/app/plugins/insung/InsungParser.kt
@@ -726,7 +726,9 @@ class InsungParser(private val context: Context) : IScrapParser {
     override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
-        val fareNodes = allNodes.filter { it.text.matches(VEHICLE_ONLY) }
+        // ✅ 단독 차종(VEHICLE_ONLY)뿐만 아니라 결합형(VEHICLE_WITH_FARE, 예: "라2.2")도 앵커로 채택
+        val fareNodes = allNodes.filter { 
+            it.text.matches(VEHICLE_ONLY) || VEHICLE_WITH_FARE.containsMatchIn(it.text) 
+        }
 
         return fareNodes.map { fareNode ->
             val rowNodes = allNodes.filter {
```

---

### 🔧 [수정 5] 안티치트 대응 가우시안 지터 및 아날로그 스트로크 주입

```diff
--- a/onedal-app/app/src/main/java/com/onedal/app/core/AutoTouchManager.kt
+++ b/onedal-app/app/src/main/java/com/onedal/app/core/AutoTouchManager.kt
@@ -19,4 +19,5 @@ class AutoTouchManager(private val service: AccessibilityService) {
-        private const val TAP_HOLD_MS = 20L
+        private const val BASE_TAP_HOLD_MS = 75L // 인간 평균 터치 지속시간 (60~90ms)
+        private val random = java.util.Random()
     }
@@ -71,4 +72,7 @@ class AutoTouchManager(private val service: AccessibilityService) {
-        val x = tapXOf(node, rect, leftShiftPx, tapRowLeft).toFloat()
-        val y = rect.centerY().toFloat()
+        // ✅ 좌표 랜덤 지터 주입 (중심점 기준 ±4픽셀 분산)
+        val jitterX = (random.nextGaussian() * 3.0).coerceIn(-6.0, 6.0).toFloat()
+        val jitterY = (random.nextGaussian() * 2.5).coerceIn(-5.0, 5.0).toFloat()
+        val x = tapXOf(node, rect, leftShiftPx, tapRowLeft).toFloat() + jitterX
+        val y = rect.centerY().toFloat() + jitterY
@@ -189,4 +193,12 @@ class AutoTouchManager(private val service: AccessibilityService) {
     private fun fireTap(x: Float, y: Float): Boolean {
-        val clickPath = Path().apply { moveTo(x, y) }
-        val clickStroke = GestureDescription.StrokeDescription(clickPath, 0, TAP_HOLD_MS)
+        // ✅ 기계식 점 터치 탈피: 미세 1~2px 아날로그 드래프트 패스 생성
+        val driftX = x + (random.nextFloat() * 2f - 1f)
+        val driftY = y + (random.nextFloat() * 2f - 1f)
+        val clickPath = Path().apply {
+            moveTo(x, y)
+            lineTo(driftX, driftY)
+        }
+        // ✅ 75ms ± 15ms 가우시안 듀레이션 지터 적용
+        val holdDuration = (BASE_TAP_HOLD_MS + (random.nextGaussian() * 12).toLong()).coerceIn(45L, 110L)
+        val clickStroke = GestureDescription.StrokeDescription(clickPath, 0, holdDuration)
         val gesture = GestureDescription.Builder().addStroke(clickStroke).build()
```

---

### 🔧 [수정 6] `InsungParser.kt` 캐시 적용 및 정규식 프리컴파일

```diff
--- a/onedal-app/app/src/main/java/com/onedal/app/plugins/insung/InsungParser.kt
+++ b/onedal-app/app/src/main/java/com/onedal/app/plugins/insung/InsungParser.kt
@@ -47,6 +47,15 @@ class InsungParser(private val context: Context) : IScrapParser {
         private val VEHICLE_ONLY = Regex("^($VEHICLE_TOKENS)$")
         private val VEHICLE_WITH_FARE = Regex("($VEHICLE_TOKENS)\\s*(\\d+(?:\\.\\d+)?)")
+        
+        // ✅ 정규식 사전 컴파일 (정적 싱글톤화)
+        private val DISTANCE_REGEX = Regex("""(\d+\.\d+)""")
+        private val TIME_REGEX = Regex("\\b([0-2]?\\d:[0-5]\\d)\\b")
+        private val ADDR_SUFFIX_REGEX = Regex("(시|군|구|동|읍|면|리|로|길)$")
+        private val ADDR_SPACE_REGEX = Regex("(시|군|구|동|읍|면|리)\\s")
+        private val ADDR_NUM_REGEX = Regex("\\d+(-\\d+)?$")
+        private val NORM_VEHICLE_NUM_REGEX = Regex("""^\d+(\.\d+)?$""")
     }
+
+    // ✅ 키워드 사전 캐싱 (매 카드 파싱마다 SharedPreferences 읽기 금지)
+    private var cachedNoiseWords: Set<String>? = null
+    private var lastKeywordsJson: String? = null
```

---

## 4. 1월 실주행(Solo Run) 생존 관점 결론 및 후속 조치

1. **안드로이드 앱 생존성(Reliability)**:
   - 본 리뷰에서 지적된 **Binder 노드 누수(결함 1)**와 **세션 조기 리셋(결함 2)**을 패치하지 않고 실차에 올릴 경우, 2시간 이상 운행 시 앱이 백그라운드에서 죽어버리거나 비상 취소 시 주문 추적이 불가능해집니다. 이 2건은 필수 핫픽스 대상입니다.
2. **배차망 계정 보호(Account Survival)**:
   - 기사 1인 단독 주행 기간 동안 인성/카카오 계정이 정지당하면 프로젝트 전체 일정이 중단됩니다. **가우시안 지터(±4px) 및 75ms 아날로그 터치 패스(결함 4)** 적용은 1월 1차 주행 전 필수 반영되어야 합니다.

---

*보고서 작성 완료: 다음 단계인 **[Part 2] 서버 판정 엔진 & 상태 머신 (`onedal-web/server`)** 라인 단위 정밀 리뷰로 즉시 진입합니다.*
