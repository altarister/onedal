package com.onedal.app.core

import com.onedal.app.core.engine.AddressForm
import com.onedal.app.core.engine.RegionRegister
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🏠 **전체 주소 판정 — 명부 대조** (기사님 «상세의 필수 요소는 전체 주소»)
 * 지명은 범용 이름이다(기사님 «검사는 범용적으로») — 명부를 인자로 넣어 판정의 모양만 본다.
 */
class AddressFormTest {

    /** 광역시 꼴(시도 포함) · 도 아래 꼴(시도 없음) · 구 없는 시 · 특별자치시 */
    private val reg = mapOf(
        "가나 다라구" to setOf("마바동", "사아동"),
        "자차시 카타구" to setOf("파하동"),
        "거너시" to setOf("더러읍", "머버동"),
        "서어특별자치시" to setOf("저처읍"),
    )

    @Test fun `광역시 꼴 - 시도 시군구 동`() = assertTrue(AddressForm.isFull("가나 다라구 마바동", reg))
    @Test fun `도 아래 꼴 - 앞에 도 이름이 붙어도 된다 · 행정동 숫자는 접는다`() =
        assertTrue(AddressForm.isFull("거나도 자차시 카타구 파하1동 123-4", reg))
    /** 픽커 사진 주소는 행정동이다 — «…본동»은 법정동 «…동»과 같게 본다 */
    @Test fun `행정동 본동은 법정동으로 접는다`() = assertTrue(AddressForm.isFull("가나 다라구 마바본동", reg))
    @Test fun `도 아래 꼴 - 도 이름 없이`() = assertTrue(AddressForm.isFull("자차시 카타구 파하동", reg))
    @Test fun `구 없는 시 + 읍`() = assertTrue(AddressForm.isFull("거너시 더러읍 산 12", reg))
    @Test fun `특별자치시 + 읍`() = assertTrue(AddressForm.isFull("서어특별자치시 저처읍", reg))
    @Test fun `도로명 번지는 전체 주소다`() = assertTrue(AddressForm.isFull("자차시 카타구 파하로 12", reg))
    @Test fun `번길 번지도`() = assertTrue(AddressForm.isFull("거너시 머버로12번길 3", reg))

    @Test fun `줄임 이름은 전체 주소가 아니다`() {
        assertFalse(AddressForm.isFull("파하3", reg))
        assertFalse(AddressForm.isFull("카타 파하", reg))
    }
    /** 구가 없어진 시(주소에 구를 안 쓴다) — «시 + 동»이면 그 시의 어느 구엔가 그 동이 있을 때 전체 주소다 */
    @Test fun `구 있는 시는 구 없이 시 + 동도 된다`() = assertTrue(AddressForm.isFull("거나도 자차시 파하동", reg))
    @Test fun `광역시는 구 없이 시도 + 동을 인정하지 않는다 (같은 이름 동이 여러 구에)`() = assertFalse(AddressForm.isFull("가나 마바동", reg))
    @Test fun `시군구의 한 토막이 빠지면 아니다 (광역 이름 없는 다라구)`() = assertFalse(AddressForm.isFull("다라구 마바동", reg))
    @Test fun `시군구만 있고 동이 없으면 아니다`() = assertFalse(AddressForm.isFull("자차시 카타구", reg))
    /** 🔄 행정동은 명부(법정동)에 없다 — 시·구가 정확히 맞은 바로 뒤 한글 «…동/읍/면/가» 토막이면 전체다 (실물 09-30 13:14 «서울 송파구 위례동» · 1f «가») */
    @Test fun `시군구 바로 뒤 한글 동 토막이면 명부에 없어도 전체다`() = assertTrue(AddressForm.isFull("가나 다라구 파하동", reg))
    @Test fun `숫자로 시작하는 101동은 동 토막이 아니다`() = assertFalse(AddressForm.isFull("가나 다라구 101동", reg))
    @Test fun `시군구가 없으면 동 토막만으로는 아니다`() = assertFalse(AddressForm.isFull("파하동", reg))

    @Test fun `실물 행정동 - 위례동 · 역삼1동 · 을지로6가`() {
        assertTrue(AddressForm.isFull("서울 송파구 위례동"))
        assertTrue(AddressForm.isFull("경기 성남시 수정구 위례동"))
        assertTrue(AddressForm.isFull("서울 강남구 역삼1동"))
        assertTrue(AddressForm.isFull("서울 중구 을지로6가"))
        assertFalse(AddressForm.isFull("서울 송파구 101동"))
    }
    @Test fun `명부 밖 지역은 아니다`() = assertFalse(AddressForm.isFull("타파시 하거구 너더동", reg))
    @Test fun `빈 값은 아니다`() = assertFalse(AddressForm.isFull("", reg))

    /**
     * 🔗 **짝 — 원달앱 명부와 서버 지도 산출물이 같다** (`pnpm gen:regions` 가 뽑는다).
     * 지도를 다시 만들어 dongCentroids.ts 가 바뀌었는데 원달앱 명부를 안 뽑으면 여기서 빨갛다.
     */
    @Test
    fun `원달앱 명부는 서버 지도 산출물과 같다`() {
        val ts = File("../../onedal-web/shared/src/dongCentroids.ts").readText()
        val rows = Regex("""\["([^"]+)","([^"]+)",[\d.]+,[\d.]+,"([^"]+)"\]""").findAll(ts).toList()
        assertTrue("dongCentroids.ts 에서 줄을 못 읽었다", rows.isNotEmpty())
        val expect = rows.groupBy({ it.groupValues[2] }, { it.groupValues[1] }).mapValues { it.value.toSet() }
        assertEquals("원달앱 명부가 서버 지도와 다르다 — cd onedal-web && pnpm gen:regions", expect, RegionRegister.bySgg)
    }

    /** 🗂️ 기본 명부는 한 번 합쳐 두고 다시 쓴다 — 두 번 불러도 같은 답 (상세 속도 · 동작 같음) */
    @Test fun `기본 명부로 두 번 불러도 같은 결과`() {
        val full = "경기 성남시 중원구 도촌동"
        assertEquals(AddressForm.isFull(full), AddressForm.isFull(full))
        assertTrue(AddressForm.isFull(full))
        assertEquals(AddressForm.isFull("중원 도촌"), AddressForm.isFull("중원 도촌"))
    }
}
