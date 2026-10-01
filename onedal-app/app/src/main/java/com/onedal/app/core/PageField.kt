package com.onedal.app.core

/**
 * 📄 **배차망 페이지 정의의 공통 이름 — 세 배차망이 같은 낱말** (reviews/24).
 * 짝은 `onedal-web/shared/src/pageFields.ts` (`PageFieldPairTest` 가 낱말과 차례를 문다).
 * 배차망마다 다른 것은 «화면 어디서 · 어떤 글자로»뿐 — 그것은 플러그인 폴더의 `…Pages.kt` 가 적는다.
 */
enum class Page(val word: String) {
    LIST("list"),           // 목록
    DETAIL("detail"),       // 상세 (확정 전)
    CONFIRM("confirm"),     // 확정 (계약 직후)
    MY_ORDERS("myorders"),  // 내 오더 · 배차내역 · 완료
}

/** 📰 모은 글자의 갈래 — 잡음 낱말로 뺀 글자 · 정의에 없어 못 알아본 글자 · 칸이 다 차서 남는 토막 */
enum class WordKind(val word: String) {
    NOISE("noise"),
    UNKNOWN("unknown"),
    EXTRA("extra"),
}

/** 🏷️ 칸 이름 — 세 배차망 공통. 새 칸은 shared 짝과 같이 더한다 */
enum class PageField(val word: String) {
    PICKUP("pickup"),                      // 상차지
    DROPOFF("dropoff"),                    // 하차지
    FARE("fare"),                          // 요금
    VEHICLE_TYPE("vehicleType"),           // 차종 · 톤수
    PICKUP_DISTANCE("pickupDistance"),     // 상차지거리
    DELIVERY_DISTANCE("deliveryDistance"), // 배송거리
    TAGS("tags"),                          // 꼬리표·배지
    RESERVATION("reservation"),            // 예약
    CLOCK("clock"),                        // 시각
    REMAINING("remaining"),                // 남은 시간
    ITEM_SIZE("itemSize"),                 // 물품 크기·수량
    MEMO("memo"),                          // 적요·유의사항·화물 글
    CONTACT("contact"),                    // 연락처·고객·담당
    ORDER_NO("orderNo"),                   // 오더번호·화물번호
    PAYMENT("payment"),                    // 결제 방법
    COMMISSION("commission"),              // 수수료
    STAGE("stage"),                        // 운행 단계
    TOLL("toll"),                          // 탁송료 · 경유비
    BILLING("billing"),                    // 계산서 · 영수증
}
