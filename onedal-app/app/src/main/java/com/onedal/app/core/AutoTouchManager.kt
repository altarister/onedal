package com.onedal.app.core

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import com.onedal.app.core.AppLogger
import android.view.accessibility.AccessibilityNodeInfo

/**
 * 시스템 레벨 스크린 터치 및 제스처 동작 전담 매니저
 */
class AutoTouchManager(private val service: AccessibilityService) {

    companion object {
        private const val TAG = "1DAL_TOUCH"
        /** 카드 줄을 찾을 때 조상을 몇 번까지 타고 올라가나 */
        private const val ROW_HOPS = 6
        /** ⏱️ 손가락을 대고 있는 시간 — 팝업을 여섯 번 여닫는 길에서 건당 30ms 가 쌓인다 */
        private const val TAP_HOLD_MS = 20L
    }

    /** ⏳ 미뤄 둔 찍기를 건 시각(부팅 기준) · 0 이면 없음 — 겹쳐 예약하지 않으려고 둔다 */
    private var pendingTapAtMs = 0L

    /** 👁️ 찍은 자리를 눈으로 보이게 하는 자국 — 기사님이 «어디에 무엇이 눌렸나»를 그 자리에서 본다 */
    private val tapMarker by lazy { TapMarker(service) }

    /** ⏳ 자국을 먼저 보여 주고 미뤘다 찍을 때 쓴다 */
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())

    /**
     * 특정 UI 노드의 Bounds(좌표 영역)를 계산하여 터치합니다.
     * @param node 클릭 대상 AccessibilityNodeInfo
     * @param leftShiftPx 노드 중앙에서 왼쪽으로 옮길 거리 (`tapRowLeft` 가 켜져 있으면 안 쓴다)
     * @param tapRowLeft 그 노드가 속한 **카드 줄의 왼쪽 끝**을 찍는다 (`TapShift.rowLeftOf`)
     * @param delayMs 자국을 이만큼 보여 준 뒤 찍는다 (0 이면 바로)
     * @param mark 자국(점)을 남길까 — **정보를 모으려고 누르는 길에서는 끈다** (기사님 지시).
     *   자국은 «앱이 기사님 대신 콜을 건드렸다»를 보이려는 것이다. 팝업을 열고 닫아 글자를
     *   모으는 길은 **그냥 수집**이라 볼 것이 없고, 점을 띄웠다 지우는 일이 메인 줄에 얹혀
     *   한 바퀴(여섯 번 누름)에 0.6~0.9초를 더 먹었다 (09-16 실측 · 겹쳐 뜨면 자리도 틀어졌다).
     * @return 성패 여부 (미룰 때는 «예약했다»는 뜻)
     */
    fun performSimulatedTouch(
        node: AccessibilityNodeInfo,
        leftShiftPx: Int = 0,
        tapRowLeft: Boolean = false,
        delayMs: Long = 0L,
        mark: Boolean = true,
    ): Boolean {
        /**
         * 🔴 **찍기 직전에 다시 잰다** (2026-09-13 · 라이브 오배차 조사에서 신설).
         *
         * `AccessibilityNodeInfo` 는 **만들어질 때의 사각형을 품고 다니는 사본**이다 —
         * `getBoundsInScreen` 은 앱에 다시 묻지 않고 그 품은 값을 돌려준다. 스캔은 노드
         * 트리를 통째로 훑느라 수백 밀리초가 걸리고, 그동안 리스트가 갱신되면 **잰 자리와
         * 누르는 자리가 달라진다.** 09-13 실측에서 알람이 456밀리초 간격으로 두 번 울렸다 —
         * 그 사이에 카드가 움직인다.
         *
         * `refresh()` 는 앱에 지금 값을 다시 묻는다. 실패하면 **그 노드는 이미 사라진 것**이라
         * 누르지 않는다 — 사라진 카드 자리에는 다른 것이 와 있다 (규칙 ④).
         */
        if (!node.refresh()) {
            AppLogger.w(TAG, "🛑 [터치 보류] 노드가 사라졌다 — 잰 자리와 누를 자리가 다르다. 누르지 않는다")
            return false
        }

        val rect = Rect()
        node.getBoundsInScreen(rect)

        val x = tapXOf(node, rect, leftShiftPx, tapRowLeft).toFloat()
        val y = rect.centerY().toFloat()

        if (x <= 0f || y <= 0f) {
            AppLogger.e(TAG, "❌ [터치 실패] 화면 좌표를 구할 수 없습니다. (X:$x, Y:$y)")
            return false
        }

        /**
         * 🔴 **미뤄 둔 찍기가 있으면 새로 걸지 않는다** (09-16 실측 14:58:52 · 두 건이 동시에 예약됐다).
         *
         * 화면 읽기는 1초마다 돈다 — 미루는 그 1초 사이에 다음 읽기가 또 알람을 울리면 **예약이 쌓인다.**
         * 첫 예약이 찍혀 상세로 넘어간 뒤 둘째가 뒤늦게 발사되면 **상세 화면 위를 찍는다** —
         * 그 자리에 무엇이 있을지 모른다. 알람은 원래 «한 번에 요금 최고 하나»다 (규칙 ①·④).
         * ⏱️ 자물쇠는 시각으로 둔다 — 콜백이 유실돼도 스스로 풀린다.
         */
        val now = android.os.SystemClock.elapsedRealtime()
        if (TapShift.blockedByPending(pendingTapAtMs, now, delayMs)) {
            AppLogger.w(TAG, "🛑 [찍기 건너뜀] 미뤄 둔 찍기가 있다 — 겹쳐 예약하지 않는다 " +
                "(${now - pendingTapAtMs}ms 전)")
            return false
        }
        // 🔒 잠금은 **미루는 길에서만** 세운다 — 바로 찍기가 세우면 뒤따르는 미룬 예약이 애꿎게 막힌다
        if (delayMs > 0L) pendingTapAtMs = now

        val showMarkerPref = try {
            service.getSharedPreferences("OneDalPrefs", android.content.Context.MODE_PRIVATE)
                .getBoolean("showTapMarker", false)
        } catch (_: Exception) { false }
        val shouldMark = mark && showMarkerPref

        /**
         * 🔴 **보내는 순간에 남긴다** — 아래 `onCompleted` 는 **2~4초 늦게** 온다
         *    (09-13 실측: 12:00:10.387 에 보낸 것이 12:00:12.676 에 찍혔다). 콜백이
         *    서비스 메인 핸들러에 줄을 서기 때문이다. 완료 로그만 보면 **시각이 거짓말한다.**
         */
        if (delayMs <= 0L) {
            AppLogger.i(TAG, "👉 [터치 발사] (X:$x, Y:$y) \"${node.text?.toString()?.take(20) ?: ""}\"")
            val fired = fireTap(x, y)
            /**
             * 👁️ **누른 다음에 점을 찍는다** (기사님 지시) — 누르기가 먼저라 동작이 안 늦는다.
             * 점은 «다음에 깨어날 때» 지워지므로(`TapMarker`), 폰이 멈춰 있던 만큼만 남는다.
             * 🔒 설정의 «터치 위치 표시» 스위치가 켜져 있을 때만 그린다.
             */
            if (shouldMark) tapMarker.show(x.toInt(), y.toInt(), node.text?.toString() ?: node.contentDescription?.toString())
            return fired
        }

        // 👁️ 미뤘다 찍는 길에서만 점을 **먼저** 보여 준다 — 기다리는 것 자체가 그 길의 뜻이다
        if (shouldMark) tapMarker.show(x.toInt(), y.toInt(), node.text?.toString() ?: node.contentDescription?.toString())

        /**
         * ⏳ **자국을 먼저 보여 주고 미뤘다 찍는다** (기사님 지시 — «영역이 보이고 1초 후 클릭»).
         *
         * 🔴 미룬 사이에 리스트가 갱신되면 **잰 자리에 다른 카드가 와 있다** — 09-13 오배차의 모양이다.
         *    그래서 쏘기 직전에 한 번 더 재서 **그대로일 때만** 쏜다 (`TapShift.sameSpot`).
         *    되돌아오는 값은 «발사됐다»가 아니라 «예약했다»는 뜻이다 — 지금 이 길은 반환값을 안 쓴다.
         */
        AppLogger.i(TAG, "⏳ [찍기 미룸] ${delayMs}ms 뒤 (X:$x, Y:$y) \"${node.text?.toString()?.take(20) ?: ""}\" — 자국을 먼저 보여 준다")
        handler.postDelayed({
            // 🐢 깨어난 순간을 **가장 먼저** 잰다 — 아래 한 줄이라도 지나면 재는 뜻이 없다
            val elapsed = if (pendingTapAtMs > 0L) android.os.SystemClock.elapsedRealtime() - pendingTapAtMs else delayMs
            pendingTapAtMs = 0L        // 🔓 찍든 못 찍든 여기서 잠금을 푼다 — 다음 알람이 걸릴 수 있게
            // 🧹 자국은 여기서 걷는다 — 보여 줄 만큼 보여 줬고, 찍는 순간 화면이 깨끗해야 한다
            if (shouldMark) tapMarker.hide()
            /**
             * 🐢 **너무 늦게 깨어났으면 쏘지 않는다** (`TapShift.wokeTooLate`).
             * 폰이 바쁘면 예약이 몇 초씩 밀린다 — 그사이 목록이 바뀌면 **다른 카드를 찍는다.**
             * 아래 자리 다시 재기가 한 겹 막지만, 우연히 같은 자리면 못 가린다 (규칙 ④).
             */
            if (TapShift.wokeTooLate(delayMs, elapsed)) {
                AppLogger.w(TAG, "🐢 [찍기 취소] ${delayMs}ms 뒤로 잡았는데 ${elapsed}ms 만에 깨어났다 — " +
                    "그사이 목록이 바뀌었을 수 있다 · 손대지 않는다 (다음 판에 다시)")
                return@postDelayed
            }
            val again = Rect()
            val alive = node.refresh().also { if (it) node.getBoundsInScreen(again) }
            val newX = if (alive) tapXOf(node, again, leftShiftPx, tapRowLeft) else null
            val newY = if (alive) again.centerY() else null
            // 🧹 자국은 여기서 걷는다 — 보여 줄 만큼 보여 줬고, 찍는 순간 화면이 깨끗해야 한다
            if (shouldMark) tapMarker.hide()
            if (TapShift.sameSpot(x.toInt(), y.toInt(), newX, newY)) {
                AppLogger.i(TAG, "👉 [터치 발사] (X:$x, Y:$y) — ${delayMs}ms 미룬 뒤 자리 그대로")
                fireTap(x, y)
            } else {
                AppLogger.w(TAG, "🛑 [찍기 취소] 미룬 ${delayMs}ms 사이에 자리가 움직였다 " +
                    "(잰 자리 X:${x.toInt()},Y:${y.toInt()} → 지금 X:$newX,Y:$newY) · 손대지 않는다")
            }
        }, delayMs)
        return true
    }

    /**
     * 👈 **어느 x 를 찍나.**
     * - `tapRowLeft` — 그 노드가 속한 카드 줄의 **왼쪽 끝**. «수락하기»(오른쪽 아래)에서 가장 먼 자리다
     * - 아니면 노드 중앙에서 `leftShiftPx` 만큼 왼쪽 (기본 0 = 중앙 그대로)
     */
    private fun tapXOf(node: AccessibilityNodeInfo, rect: Rect, leftShiftPx: Int, tapRowLeft: Boolean): Int {
        if (tapRowLeft) {
            rowRectOf(node)?.let { return TapShift.rowLeftOf(it.left) }
            AppLogger.w(TAG, "⚠️ [줄 못 찾음] 카드 줄을 못 찾아 요금 자리에서 왼쪽으로 옮겨 찍는다")
            return TapShift.leftOf(rect.centerX(), TapShift.PICKER_LIST_LEFT_PX)
        }
        return TapShift.leftOf(rect.centerX(), leftShiftPx)
    }

    /**
     * 📐 그 글자가 속한 **카드 줄**의 사각형 — 화면 폭의 절반을 넘는 첫 조상.
     * 요금 글자 자체는 오른쪽 끝의 짧은 한 조각이라, 줄의 왼쪽 끝을 알려면 부모를 타고 올라가야 한다.
     */
    private fun rowRectOf(node: AccessibilityNodeInfo): Rect? {
        val screenWidth = service.resources.displayMetrics.widthPixels
        var cur: AccessibilityNodeInfo? = node.parent
        var hops = 0
        while (cur != null && hops < ROW_HOPS) {
            val r = Rect()
            cur.getBoundsInScreen(r)
            if (r.width() >= screenWidth / 2) return r
            cur = cur.parent
            hops++
        }
        return null
    }

    /** 실제 제스처 주입 — 미루든 안 미루든 마지막 한 걸음은 여기 하나다 */
    private fun fireTap(x: Float, y: Float): Boolean {
        val clickPath = Path().apply { moveTo(x, y) }
        // ⏱️ 누르고 있는 시간 — 짧을수록 다음 걸음이 빨리 온다. 팝업을 여섯 번 여닫는 길에서
        //    건당 30ms 가 쌓인다 (기사님 지시 «1초 안에 다 볼 수 있게»).
        //    🔴 더 줄이지 않는다 — 너무 짧으면 앱이 탭으로 안 친다
        val clickStroke = GestureDescription.StrokeDescription(clickPath, 0, TAP_HOLD_MS)
        val gesture = GestureDescription.Builder().addStroke(clickStroke).build()

        val dispatched = service.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                super.onCompleted(gestureDescription)
                AppLogger.d(TAG, "✅ [가로채기 성공!] 화면 좌표 (X:$x, Y:$y) 터치 완료!")
                AppLogger.roadmap("버튼 터치 완료 (가로채기 성공) X:$x, Y:$y", "")
            }
            override fun onCancelled(gestureDescription: GestureDescription?) {
                super.onCancelled(gestureDescription)
                AppLogger.e(TAG, "❌ [터치 실패] 시스템에 의해 무시됨")
            }
        }, null)

        if (!dispatched) {
            AppLogger.e(TAG, "❌ [권한 오류] 제스처 발생이 차단되었습니다.")
        }

        return dispatched
    }

    /**
     * 화면 상의 특정 텍스트를 포함하는 노드를 찾아 클릭합니다.
     * @param rootNode 최상위 화면 노드
     * @param targetText 찾을 텍스트 (명확한 식별을 위해 포함 여부 또는 시작 여부 검사)
     * @param isStartsWith true면 startsWith 매칭, false면 정확한 매칭
     * @param mark 자국(점)을 남길까 — 정보를 모으려고 누르는 길에서는 끈다 (`performSimulatedTouch` 주석)
     * @return 성패 여부
     */
    fun findAndClickByText(
        rootNode: AccessibilityNodeInfo?,
        targetText: String,
        isStartsWith: Boolean = false,
        mark: Boolean = true,
        currentMode: String? = null,
    ): Boolean {
        // 🛑 [체험 모드 하드락] 체험 모드일 때는 수락/확정 관련 텍스트 터치를 물리적으로 100% 원천 차단!
        if (currentMode == "SIMULATION" && (targetText.contains("수락") || targetText.contains("확정") || targetText == "닫기")) {
            AppLogger.e(TAG, "🛑 [체험 모드 절대 방어] '$targetText' 버튼 터치 시도가 감지되었으나 물리적으로 원천 차단(Block)되었습니다!")
            return false
        }

        val targetNode = findNodeByText(rootNode, targetText, isStartsWith)
        if (targetNode != null) {
            AppLogger.roadmap("'$targetText' 버튼 인식 ➡️ 클릭 시도", "")
            val result = performSimulatedTouch(targetNode, mark = mark)
            targetNode.recycle()
            return result
        }
        AppLogger.w(TAG, "⚠️ 요소 찾기 실패: '$targetText'")
        return false
    }

    /**
     * 노드 트리를 재귀적으로 순회하며 텍스트를 찾습니다.
     */
    private fun findNodeByText(node: AccessibilityNodeInfo?, targetText: String, isStartsWith: Boolean): AccessibilityNodeInfo? {
        if (node == null) return null

        val nodeText = node.text?.toString()?.trim() ?: ""
        val contentDesc = node.contentDescription?.toString()?.trim() ?: ""

        val isMatch = if (isStartsWith) {
            nodeText.startsWith(targetText) || contentDesc.startsWith(targetText)
        } else {
            nodeText == targetText || contentDesc == targetText
        }

        if (isMatch) return AccessibilityNodeInfo.obtain(node)

        for (i in 0 until node.childCount) {
            val child = node.getChild(i)
            val found = findNodeByText(child, targetText, isStartsWith)
            if (found != null) {
                child?.recycle()
                return found
            }
            child?.recycle()
        }
        return null
    }

    /**
     * 시스템 [뒤로 가기] 버튼 기능을 수행합니다.
     */
    fun performBack(why: String? = null): Boolean {
        /**
         * 👁️ **뒤로 가기에도 자국을 남긴다** (기사님 지시 — 앱이 한 짓은 배차망을 가리지 않고 다 보여야 한다).
         * 찍는 좌표가 없는 길이라 **화면 아래 가운데**에 띄운다.
         * 🔴 설정의 «터치 위치 표시» 스위치가 켜져 있을 때만 그린다.
         */
        val showMarkerPref = try {
            service.getSharedPreferences("OneDalPrefs", android.content.Context.MODE_PRIVATE)
                .getBoolean("showTapMarker", false)
        } catch (_: Exception) { false }
        if (showMarkerPref) {
            val dm = service.resources.displayMetrics
            tapMarker.show(dm.widthPixels / 2, dm.heightPixels - TapMarker.RADIUS_PX * 3, why, action = "뒤로")
        }

        val dispatched = service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
        if (dispatched) {
            AppLogger.d(TAG, "🔙 [백버튼 전송] 글로벌 액션 수행 완료")
        } else {
            AppLogger.e(TAG, "❌ [백버튼 실패] 글로벌 액션 권한 오류")
        }
        return dispatched
    }
}
