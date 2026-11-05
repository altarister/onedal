package com.onedal.app.core

import com.google.gson.Gson
import com.onedal.app.models.BaseCall
import com.onedal.app.models.CallJob
import com.onedal.app.models.CallLoad
import com.onedal.app.models.CallMoney
import com.onedal.app.models.CallRoute
import com.onedal.app.models.CallRouteListRegion
import com.onedal.app.models.CallStop
import com.onedal.app.models.CallTime
import com.onedal.app.models.MoneyLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** 🎯 **기본 콜 모양을 JSON 으로 보내면 빈 칸은 빠지고 묶음은 묶음대로 간다** (계획서 B3) — 서버 BaseCall 과 같은 경로다 */
class BaseCallShapeTest {
    @Test fun `칸은 서버 경로 그대로 간다`() {
        val call = BaseCall(
            id = "c1", targetApp = "kakaopicker",
            route = CallRoute(listRegion = CallRouteListRegion(pickup = "광주 경안"), pickup = CallStop(addressDetail = "경기 광주시"), dropoff = CallStop()),
            money = CallMoney(lines = listOf(MoneyLine(kind = "income", won = 2529.0))),
            load = CallLoad(itemSize = "소형"), time = CallTime(), job = CallJob(tagsText = "퀵"),
        )
        val json = Gson().toJsonTree(call).asJsonObject
        assertEquals("광주 경안", json["route"].asJsonObject["listRegion"].asJsonObject["pickup"].asString)
        assertEquals("income", json["money"].asJsonObject["lines"].asJsonArray[0].asJsonObject["kind"].asString)
        assertFalse("빈 칸은 안 싣는다", json["load"].asJsonObject.has("weightKg"))
    }
}
