# 🧩 1DAL 플러그인 인터페이스 코드 수준 명세서

> **문서 상태**: v1.0  
> **작성일**: 2026-05-05  
> **목적**: 다중 플랫폼(인성콜, 화물24시 등)을 지원하기 위한 플러그인 인터페이스 시그니처 정의

---

## 1. BaseScrapParser — 화면 텍스트 파싱 인터페이스

화면에서 수집한 텍스트 리스트를 받아 표준화된 `SimplifiedOfficeOrder`로 변환하는 파서입니다.

```kotlin
package com.onedal.app.core.engine

import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.ScreenTextNode

/**
 * 각 타겟 앱(인성콜, 24시 등)별로 이 인터페이스를 구현합니다.
 * HijackService는 이 인터페이스만 알면 되고, 구현체에 대해서는 모릅니다.
 */
interface BaseScrapParser {

    /**
     * 화면의 텍스트 리스트를 파싱하여 콜 오더로 변환
     * @param screenTexts 화면에서 수집된 원시 텍스트 배열
     * @return 파싱된 오더 (파싱 실패 시 pickup/dropoff가 "미상"인 빈 오더 반환)
     */
    fun parse(screenTexts: List<String>): SimplifiedOfficeOrder

    /**
     * 콜 리스트에서 개별 콜들을 분리 추출 (리스트 화면 전용)
     * @param textNodes 좌표 포함 텍스트 노드 배열
     * @return 콜 단위로 분리된 (오더, fareNode) 쌍 리스트
     */
    fun extractOrdersFromList(textNodes: List<ScreenTextNode>): List<Pair<SimplifiedOfficeOrder, ScreenTextNode>>

    /**
     * AUTO 필터 판정: 이 콜을 클릭(사냥)할 가치가 있는지
     * @param order 파싱된 오더
     * @return true면 클릭, false면 패스
     */
    fun shouldClick(order: SimplifiedOfficeOrder): Boolean

    /**
     * 상세 화면(DETAIL_CONFIRMED)에서 팝업 서핑으로 수집한 텍스트를 
     * DetailedOfficeOrder로 변환
     * @param baseOrder 1차 파싱된 기본 오더
     * @param accumulatedText 팝업에서 수집한 텍스트 (적요 + 출발지 + 도착지)
     * @return 상세 정보가 채워진 DetailedOfficeOrder
     */
    fun parseDetailed(
        baseOrder: SimplifiedOfficeOrder, 
        accumulatedText: String
    ): com.onedal.app.models.DetailedOfficeOrder
}
```

### 인성콜 구현체 위치
`com.onedal.app.plugins.insung.InsungParser : BaseScrapParser`

---

## 2. BaseAutomationEngine — 화면 자동 제어 인터페이스

타겟 앱의 화면을 제어(터치, 뒤로가기, 팝업 열기/닫기)하는 매커니즘입니다.

```kotlin
package com.onedal.app.core.engine

import android.view.accessibility.AccessibilityNodeInfo

/**
 * 각 타겟 앱별 화면 조작 방법이 다르므로 이를 추상화합니다.
 * 예: 인성콜은 3단계 팝업 서핑, 화물24시는 단일 페이지 스크롤
 */
interface BaseAutomationEngine {

    /**
     * 리스트 화면에서 특정 콜을 클릭 (AUTO 광클)
     * @param rootNode 최상위 화면 노드
     * @param targetFareNode 클릭할 요금 노드 (좌표 기준점)
     * @return 터치 성공 여부
     */
    fun clickOrderInList(rootNode: AccessibilityNodeInfo, targetFareNode: ScreenTextNode): Boolean

    /**
     * 상세 화면에서 "확정" 버튼 클릭
     * @return 성공 여부
     */
    fun clickConfirmButton(rootNode: AccessibilityNodeInfo): Boolean

    /**
     * 상세 화면에서 "취소" 버튼 클릭 (2차 필터 실패 또는 데스밸리 취소)
     * @return 성공 여부
     */
    fun clickCancelButton(rootNode: AccessibilityNodeInfo): Boolean

    /**
     * 팝업 서핑 시작 — 앱별로 서핑 순서와 방법이 다를 수 있음
     * @return 서핑 시작 성공 여부
     */
    fun startPopupSurfing(rootNode: AccessibilityNodeInfo): Boolean

    /**
     * 현재 열린 팝업 닫기
     * @return 닫기 성공 여부
     */
    fun closeCurrentPopup(rootNode: AccessibilityNodeInfo): Boolean

    /**
     * 시스템 뒤로가기 수행
     */
    fun performBack(): Boolean
}
```

### 인성콜 구현체 위치
`com.onedal.app.plugins.insung.InsungAutomationEngine : BaseAutomationEngine`

---

## 3. ScreenKeywords 등록 체계

각 플러그인은 자신의 화면 판별 키워드를 `AppKeywords` 오브젝트에 등록합니다.

```kotlin
// 현재 구조 (이미 구현됨):
object AppKeywords {
    val INSUNG = ScreenKeywords(
        listRequired = listOf("신규", "빠른설정"),
        detailKeywords = listOf("적요상세", "요금"),
        // ... 나머지 키워드
    )

    val TWENTYFOUR = ScreenKeywords(
        // 화물24시 전용 키워드 (TODO: 실제 앱 분석 후 채움)
        listRequired = listOf("TODO"),
        // ...
    )
}
```

### 새 플러그인 추가 절차

1. `plugins/{앱이름}/` 패키지 생성
2. `{앱이름}Parser.kt` — `BaseScrapParser` 구현
3. `{앱이름}AutomationEngine.kt` — `BaseAutomationEngine` 구현
4. `AppKeywords`에 `{앱이름} = ScreenKeywords(...)` 추가
5. `EngineRouter`에 패키지명 → 플러그인 매핑 추가

---

## 4. EngineRouter — 플러그인 라우터

현재 최상단 앱의 패키지명을 감지하여 적절한 플러그인 엔진을 반환합니다.

```kotlin
package com.onedal.app.core.engine

/**
 * 활성화된 타겟 앱에 따라 올바른 Parser + AutomationEngine을 라우팅합니다.
 */
class EngineRouter(private val enabledApps: Set<String>) {

    // 패키지명 → 플러그인 매핑 레지스트리
    private val registry = mapOf(
        "com.insung.app" to PluginBundle(
            parser = InsungParser(),
            engine = InsungAutomationEngine(),
            keywords = AppKeywords.INSUNG
        ),
        "com.cargo24.app" to PluginBundle(
            parser = Cargo24Parser(),
            engine = Cargo24AutomationEngine(),
            keywords = AppKeywords.TWENTYFOUR
        )
    )

    /**
     * 현재 포그라운드 앱 패키지명으로 적절한 플러그인을 반환
     * @param packageName 현재 화면의 패키지명
     * @return 매칭된 플러그인 번들 (없으면 null → 스캔 중단)
     */
    fun resolve(packageName: String): PluginBundle? {
        if (packageName !in enabledApps) return null  // 비활성화된 앱은 무시
        return registry[packageName]
    }
}

data class PluginBundle(
    val parser: BaseScrapParser,
    val engine: BaseAutomationEngine,
    val keywords: ScreenKeywords
)
```

---

## 5. HijackService 내부 사용 예시 (리팩토링 후)

```kotlin
// 현재: scrapParser.parse(screenTexts)
// 리팩토링 후:

val plugin = engineRouter.resolve(event.packageName.toString()) ?: return
val order = plugin.parser.parse(screenTexts)

if (plugin.parser.shouldClick(order)) {
    plugin.engine.clickOrderInList(rootNode, fareNode)
}
```

`HijackService`는 더 이상 인성콜/화물24시를 구분하지 않습니다. `EngineRouter`가 적절한 플러그인을 꽂아주면 동일한 흐름으로 처리됩니다.
