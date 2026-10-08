package com.onedal.app.plugins.kakaopicker

import com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords.AfterDetail
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 👆 **사실 ③ — 픽커 «기사님이 수락했나»를 알아보는 지금 답** (31 P0 A7 · 원달앱 CLAUDE.md «픽커는 수락하면 바로 계약»).
 * 앞 화면이 수락 전 상세였을 때(부르는 쪽이 본다): 상세 그대로 → 아무것도 · 목록으로 → 돌아옴 · 상세 잔상 → 버림 · 그 밖 → 수락 확인.
 * 못 잡는 것: 앞 화면을 보는 배선(`KakaoPickerPlugin.onScreenChanged`) · 미리보기를 올린 적이 있나(`reportPickerAccepted`).
 */
class PickerAfterDetailTest {
    private fun after(returnedToList: Boolean, residue: Boolean, stillOnDetail: Boolean) =
        KakaoPickerKeywords.afterDetail(returnedToList, residue, stillOnDetail)

    @Test fun `상세 글자만 바뀐 상세 → 상세는 떠난 것이 아니다 — 다른 사실보다 먼저`() {
        assertEquals(AfterDetail.STILL_ON_DETAIL, after(returnedToList = true, residue = true, stillOnDetail = true))
    }

    @Test fun `목록으로 돌아왔으면 수락이 아니다 — 잔상보다 먼저`() {
        assertEquals(AfterDetail.RETURNED_TO_LIST, after(returnedToList = true, residue = true, stillOnDetail = false))
    }

    @Test fun `상세 잔상이 남은 화면은 버린다`() {
        assertEquals(AfterDetail.RESIDUE, after(returnedToList = false, residue = true, stillOnDetail = false))
    }

    @Test fun `상세를 떠나 목록이 아닌 화면 — 수락을 확인하러 간다`() {
        assertEquals(AfterDetail.CHECK_ACCEPTED, after(returnedToList = false, residue = false, stillOnDetail = false))
    }
}
