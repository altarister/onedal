# 🛡️ 1DAL 엣지케이스 및 방어 로직 명세서

> **문서 상태**: v1.0  
> **작성일**: 2026-05-05  
> **근거 코드**: `HijackService.kt`  
> **목적**: 실전 운영에서 발견된 모든 엣지케이스와 그 방어 메커니즘을 문서화

---

## 1. 고스트 응답 방어 (Ghost Defense)

### 문제
서버(Piggyback)로부터 과거 세션의 잔류 판결이 도착하는 경우가 있습니다. 예를 들어:
- 10초 전에 콜 A를 처리하다 취소함
- 현재 콜 B를 처리 중
- 서버가 뒤늦게 콜 A에 대한 "KEEP" 판결을 보냄
- → 콜 B 화면에서 "닫기"가 눌리는 대참사

### 방어 로직

```kotlin
// TelemetryManager.decisionCallback 연결 시:
telemetryManager.decisionCallback = { receivedOrderId, action ->
    if (receivedOrderId.isNotEmpty() && receivedOrderId != currentSessionOrderId) {
        // 👻 Ghost Defense 발동! 과거 허깨비 응답 폐기
        AppLogger.e(TAG, "수신된 ID가 현재 오더 ID와 다릅니다!")
    } else {
        // ✅ ID 일치 → 정상 집행
        executeDecisionImmediately(action)
    }
}
```

### 핵심 원리
`currentSessionOrderId`와 수신된 `receivedOrderId`를 비교하여, 현재 처리 중인 오더에 대한 판결만 수락합니다.

---

## 2. 팝업 잔상 방어 (Popup Residue Defense)

### 문제
안드로이드에서 팝업을 닫으면 닫기 애니메이션이 0.1~0.3초간 재생됩니다. 이 동안 팝업의 텍스트("출발지 상세", "도착지 상세")가 화면에 잔류합니다.  
엔진이 이 잔상을 보고 "아직 팝업 안에 있다"고 오판하여 화면 처리 로직을 다시 실행하는 오류가 발생합니다.

### 방어 로직

```kotlin
private fun isPopupResidue(rawScreenStr: String): Boolean {
    return rawScreenStr.contains("출발지 상세") || rawScreenStr.contains("도착지 상세")
}
```

`handlePreConfirmScreen()`과 `handleConfirmedScreen()` 진입 시 가장 먼저 호출되어, 잔상이 감지되면 해당 프레임을 통째로 스킵합니다.

### 영향 범위
- `DETAIL_PRE_CONFIRM` 핸들러의 맨 첫 줄
- `DETAIL_CONFIRMED` 핸들러의 맨 첫 줄

---

## 3. 핑거프린트 중복 이벤트 방어

### 문제
안드로이드 `TYPE_WINDOW_CONTENT_CHANGED` 이벤트는 화면 내용이 전혀 변하지 않았는데도 반복 발생합니다. 매번 처리하면 CPU 과부하와 중복 동작이 발생합니다.

### 방어 로직

```kotlin
val screenTexts = mutableListOf<String>()
gatherNodeTexts(rootNode, screenTexts)
val fingerprint = screenTexts.sorted().hashCode()

if (fingerprint == lastScreenFingerprint) { 
    rootNode.recycle()
    return  // 화면 변경 없음 → 스킵
}
lastScreenFingerprint = fingerprint
```

화면의 모든 텍스트를 정렬 후 해시화하여, 이전 프레임과 비교합니다.

---

## 4. 자기 자신 텍스트 오염 방어

### 문제
1DAL 앱 자체의 오버레이 UI(상태 표시) 텍스트가 접근성 이벤트에 포함되면:
- 인성앱의 콜 데이터가 1DAL의 UI 텍스트와 섞여 파싱 오류 발생
- 최악의 경우 무한 루프 (자기 UI 변경 → 이벤트 발생 → 처리 → UI 변경 → ...)

### 방어 로직

```kotlin
// gatherNodeTexts() 및 extractAllTextNodes() 내부:
if (node.packageName?.toString() == "com.onedal.app") return
```

노드 수집 시 패키지명이 자기 자신(`com.onedal.app`)이면 무조건 건너뜁니다.

---

## 5. 거대 컨테이너 노드 필터링

### 문제
화면 루트에 가까운 거대한 컨테이너 노드(전체 화면 크기)가 텍스트를 가지고 있으면, 해당 노드의 좌표(Bounding Box)로 터치하면 엉뚱한 곳이 클릭됩니다.

### 방어 로직

```kotlin
if (rect.height() < MAX_TEXT_NODE_HEIGHT_PX && rect.width() > 0) {
    out.add(ScreenTextNode(text, node, rect))
}
```

높이가 400px 이상인 노드는 "컨테이너"로 간주하고 파싱 대상에서 제외합니다.

---

## 6. 해시 캐시 메모리 폭발 방어

### 문제
장시간 가동 시 `processedOrderHashes`와 `recentListOrders`가 무한히 늘어나 메모리를 잡아먹습니다.

### 방어 로직

```kotlin
if (processedOrderHashes.size > 100) {
    val keepers = processedOrderHashes.toList().takeLast(50)
    processedOrderHashes.clear()
    processedOrderHashes.addAll(keepers)
}
```

해시 캐시가 100개를 초과하면 최근 50개만 남기고 나머지를 삭제합니다.  
`recentListOrders`도 동일한 로직이 적용됩니다.

---

## 7. 서버 판결 대기 중 화면 조작 차단

### 문제
데스밸리 타이머 가동 중(서버 판결 대기 중)에 화면 변경 이벤트가 들어오면, 엔진이 리스트의 다른 콜을 클릭하거나 팝업을 건드릴 수 있습니다.

### 방어 로직

```kotlin
if (isWaitingForServerDecision) {
    rootNode.recycle()
    return  // 화면 핸들러 라우팅 자체를 건너뜀
}
```

`isWaitingForServerDecision == true` 상태에서는 `onAccessibilityEvent()`의 화면별 핸들러(when 분기) 자체를 실행하지 않습니다.

---

## 8. 복귀 감지 (강제 세션 정리)

### 문제
기사님이 AUTO 사냥 도중 수동으로 "뒤로가기"를 누르거나 리스트로 돌아갔는데, 앱이 이를 인지하지 못하면 세션 락이 영원히 풀리지 않습니다.

### 방어 로직

```kotlin
if (detected == ScreenContext.LIST 
    || detected == ScreenContext.LIST_COMPLETED 
    || rawScreenStr.contains("대기 중인 오더가 없")) {
    
    if (isAutoSessionActive || isWaitingForServerDecision || currentSessionOrderId.isNotEmpty()) {
        resetSessionState()  // 세션 및 데스밸리 락 완전 해제
    }
}
```

리스트 화면이나 "대기 중인 오더가 없" 텍스트를 감지하면, 현재 진행 중인 모든 세션 상태를 강제 초기화합니다.

---

## 9. 2차 필터 실패 시 안전 탈출

### 문제
AUTO 모드에서 리스트의 1차 필터를 통과하여 상세 화면에 진입했지만, 상세 정보(적요, 블랙리스트 등)를 확인한 결과 "똥콜"인 경우. 이때 서버에 보고 없이 빠르게 빠져나와야 합니다.

### 방어 로직

```kotlin
if (!isAutoSessionActive || isTarget) {
    // 정상 흐름 (서버 보고 + 확정)
} else {
    // 2차 필터 실패 → 즉시 탈출
    isDetailScrapSent = true  // 다음 사이클 스킵 마킹
    touchManager.findAndClickByText(rootNode, "취소") 
        ?: touchManager.performBack()  // "취소" 못 찾으면 뒤로가기
    resetSessionState()
}
```

"취소" 버튼을 못 찾을 경우의 대안으로 시스템 `performBack()`을 실행합니다.

---

## 10. 반송(취소) 후 재클릭 방지 (지문 선등록)

### 문제
AUTO 모드에서 2차 필터에 실패하여 "취소"로 리스트에 돌아왔을 때, 동일한 콜이 리스트에 그대로 남아있어 다시 클릭하는 무한 루프가 발생합니다.

### 방어 로직

```kotlin
// 광클 직전에 해시를 먼저 등록
processedOrderHashes.add(orderHash)  // 선(先)기록!
touchManager.performSimulatedTouch(fareNode)  // 그 다음에 터치
```

터치 **전에** 해당 콜의 해시를 캐시에 등록하여, 리스트 복귀 시 이미 처리된 콜로 인식되도록 합니다.
