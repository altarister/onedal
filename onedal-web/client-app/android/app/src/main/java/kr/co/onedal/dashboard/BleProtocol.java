package kr.co.onedal.dashboard;

import java.util.UUID;

/**
 * 📶 **관제앱 공급의 약속 값** — shared `bleProtocol.ts` 를 자바로 옮긴 것(원천은 shared).
 * 서버 jest `bleProtocolPair.test.ts` 가 이 파일을 글자로 읽어 shared 와 견준다 — 한쪽만 고치면 그 검사가 빨갛다.
 */
final class BleProtocol {
    private BleProtocol() {}

    /* 서버 공급 소켓 — 이름공간과 사건 이름 */
    static final String SUPPLY_NAMESPACE = "/supply";
    static final String EVENT_SUPPLY = "phone-supply";
    static final String EVENT_DECISION = "phone-decision";
    static final String EVENT_DECISION_ACK = "phone-decision-ack";

    /* 블루투스 — 스캔폰 원달앱이 여는 서비스와 칸 셋 */
    static final UUID SERVICE = UUID.fromString("6f1d1000-1da1-4b1e-9e00-0000000000a1");
    static final UUID SMALL = UUID.fromString("6f1d1001-1da1-4b1e-9e00-0000000000a1");
    static final UUID BIG = UUID.fromString("6f1d1002-1da1-4b1e-9e00-0000000000a1");
    static final UUID NOTIFY = UUID.fromString("6f1d1003-1da1-4b1e-9e00-0000000000a1");
    static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    /* 메시지 종류 바이트 */
    static final byte HELLO = 1;
    static final byte SUPPLY = 2;
    static final byte PHONE = 3;
    static final byte DECISION = 4;
    static final byte ACK = 5;
    static final byte BREATH = 6;

    static final int MAX_WRITE = 512;
    static final long BREATH_MS = 1000;
    static final long SILENT_MS = 5000;
}
