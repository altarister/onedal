package com.onedal.app.core

/**
 * ⏳ **기다림 장부 — 거는 함수가 걸기와 적기를 한 번에, 끄기도 여기서만** (1f · 04 · ab «가» · `WaitBookTest`).
 *
 * 부품이 제 값·제 켜기를 맡되, 걸 때는 이 장부의 [schedule] 로 건다 — 이름 · 건 쪽 · 만료 시각이 한 곳에 보인다.
 * 틱은 두지 않는다 — 지금 시계와 [Poster](앱에서는 메인 Handler)로 같은 ms 에 같은 일을 한다. 1초 미만도 같은 함수.
 * 건 쪽: [SESSION](콜 한 건 · 콜이 끝나면 한 번에 거둔다) · [LIST](목록을 떠나면 거둔다) · [DECISION](판결 집행 — 콜이 끝나도 거두지 않는다) · [SERVICE].
 * 오늘 버그 셋(1초 보고 스위치를 셋이 나눠 씀 · 5분 묵은 «앱이 연 콜» · 3초 값 빌려 씀)은 모두 «누가 무엇을 걸어 뒀나 안 보임»에서 났다.
 * 메인 스레드에서만 부른다.
 */
class WaitBook(private val poster: Poster, private val clock: () -> Long) {
    interface Poster {
        fun post(r: Runnable, delayMs: Long)
        fun remove(r: Runnable)
    }

    companion object {
        const val SESSION = "세션"
        const val LIST = "목록"
        /** 판결 버튼 — 인성·24 에서 앱이 계약한 콜의 «취소» 누름이 곧 계약 취소라, 그 사이 콜이 끝나도 거두지 않는다 */
        const val DECISION = "판결"
        const val SERVICE = "서비스"
    }

    data class Pending(val name: String, val owner: String, val remainMs: Long)

    private class Entry(val owner: String, val dueMs: Long, val runnable: Runnable)

    private val entries = LinkedHashMap<String, Entry>()

    /** 같은 이름이 걸려 있으면 먼저 거두고 다시 건다. 돌 때 장부에서 빠진다 */
    fun schedule(name: String, owner: String, delayMs: Long, action: () -> Unit) {
        cancel(name)
        val wait = maxOf(0L, delayMs)
        lateinit var r: Runnable
        r = Runnable {
            if (entries[name]?.runnable === r) entries.remove(name)
            action()
        }
        entries[name] = Entry(owner, clock() + wait, r)
        poster.post(r, wait)
    }

    fun cancel(name: String): Boolean {
        val e = entries.remove(name) ?: return false
        poster.remove(e.runnable)
        return true
    }

    /** 건 쪽 몫을 모두 거둔다 — 거둔 이름들 */
    fun cancelOwner(owner: String): List<String> {
        val names = entries.filterValues { it.owner == owner }.keys.toList()
        names.forEach { cancel(it) }
        return names
    }

    fun cancelAll() { entries.keys.toList().forEach { cancel(it) } }

    fun isPending(name: String): Boolean = name in entries

    fun pending(): List<Pending> {
        val now = clock()
        return entries.map { (name, e) -> Pending(name, e.owner, e.dueMs - now) }
    }
}
