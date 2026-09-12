import type { CallOption } from '@onedal/shared';
import { dwellRatesOf, JUDGMENT_FIELDS, judgmentDefaults, CALL_OPTION_COLUMNS, buildDefaultCallOptions,
         STEP_TABLES, FILTER_FIELDS, QUAD_FIELDS, RADIUS_BASE_KM_DEFAULT } from "@onedal/shared";
import Database from "better-sqlite3";
import path from "path";

// .env 또는 서버 환경에서 주입된 DB_FILE 환경 변수 사용 (기본값: local.db)
const dbFileName = process.env.DB_FILE || "local.db";
const dbPath = path.resolve(__dirname, `../${dbFileName}`);
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

console.log(`📂 SQLite DB 준비 완료: ${dbPath}`);

// ═══════════════════════════════════════════════════════════════
// [2026-08-10] 스키마 진화 — CREATE TABLE IF NOT EXISTS 의 함정
//
// 🔴 `CREATE TABLE IF NOT EXISTS` 는 **이미 있는 테이블에 컬럼을 추가하지 않는다.**
//    그래서 스키마에 컬럼을 적어 넣어도 기존 DB 에는 반영되지 않고,
//    INSERT 가 `no such column: unit` 으로 조용히 실패했다.
//    (기사님 관제탑에서 "통화 종료 · 저장"을 눌러도 아무 일이 없던 원인)
//
//    CHECK 제약은 더 나쁘다. ALTER 로 못 바꾸는데, 허용값이 늘면(마일스톤 2개 → 4개)
//    옛 테이블은 새 값을 영영 거부한다. 게다가 그 목록은 `@onedal/shared` 의
//    MILESTONES / MILESTONE_SOURCES 와 **두 번째 진실 공급원**이 된다 (이슈 JJ 와 같은 함정).
//    → enum 성 컬럼의 CHECK 를 걷어내고 검증은 애플리케이션 한 곳에서만 한다.
// ═══════════════════════════════════════════════════════════════

/** 빠진 컬럼만 덧붙인다. **데이터를 건드리지 않는 순수 추가 연산**이다 */
function ensureColumns(table: string, columns: Record<string, string>) {
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!exists) return;
    const have = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name));
    for (const [col, type] of Object.entries(columns)) {
        if (have.has(col)) continue;
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
        console.log(`🔧 [스키마] ${table}.${col} 컬럼 추가`);
    }
}

/**
 * 굳어버린 CHECK 제약을 걷어낸다. **행을 먼저 복사한 뒤에만** 옛 테이블을 지운다.
 * (CLAUDE.md 가 금지한 "조건부 DROP TABLE" 은 데이터가 날아가는 패턴이다.
 *  여기는 복사 → 교체 순서라 한 건도 잃지 않는다. 트랜잭션으로 묶는다)
 */
function dropStaleCheck(table: string, createSql: string, indexSql: string[]) {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as { sql?: string } | undefined;
    if (!row?.sql || !row.sql.includes('CHECK(')) return;

    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name).join(', ');
    const before = (db.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as any).c;

    db.transaction(() => {
        db.exec(createSql.replace(table, `${table}__new`));
        db.exec(`INSERT INTO ${table}__new (${cols}) SELECT ${cols} FROM ${table}`);
        db.exec(`DROP TABLE ${table}`);
        db.exec(`ALTER TABLE ${table}__new RENAME TO ${table}`);
        for (const ix of indexSql) db.exec(ix);
    })();

    const after = (db.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as any).c;
    console.log(`🔧 [스키마] ${table} CHECK 제약 제거 (${before}건 → ${after}건 보존)`);
}





// ═══════════════════════════════════════
// [1] 사용자 테이블
// ═══════════════════════════════════════
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        google_id TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        avatar TEXT,
        role TEXT DEFAULT 'USER' CHECK(role IN ('ADMIN', 'USER')),
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
`);

// ═══════════════════════════════════════
// [2] 다중 로그인 토큰
// ═══════════════════════════════════════
db.exec(`
    CREATE TABLE IF NOT EXISTS user_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        expires_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);

// ═══════════════════════════════════════
// [3] 단말기-유저 맵핑
// ═══════════════════════════════════════
db.exec(`
    CREATE TABLE IF NOT EXISTS user_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        device_name TEXT,
        registered_at TEXT DEFAULT (datetime('now', 'localtime')),
        mode TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, device_id)
    )
`);

/**
 * 🎛️ **기기 모드는 DB 에 산다** (기사님 확정 2026-08-30 · `docs/지금/기기_모드.md` §6-①).
 *
 * 예전엔 메모리 두 곳(`activeDevices` · `deviceModePreference`)에만 있었고, 값이 둘일 때는
 * 재시작 후 `activeFilter.isActive` 로 되살렸다. 값이 셋이 되면서 그게 안 된다 —
 * `isActive === false` 에서 **「대기」와 「알람」을 못 가른다.**
 *
 * 🔴 그러면 **알람이 말없이 대기로 떨어진다.** 화면도 필터 성적표도 멀쩡하고
 *    **알람만 안 울린다** — 이 레포가 여러 번 당한 「조용한 실패」 그대로다.
 *
 * 🔴 **비워 둘 수 있어야 한다 (`NULL` 허용).** `NULL` 은 «아직 한 번도 안 골랐다»는 뜻이고,
 *    그때만 옛 추론(`activeFilter.isActive ? AUTO : MANUAL`)이 돈다. 기본값을 박으면
 *    그 구분이 사라져 **콜 필터를 켠 채 새 폰을 붙여도 대기로 앉는다** (규칙 ④ — 0 이 아니라 null).
 *
 * ⚠️ `CHECK` 를 걸지 않는다. 모드 값은 `shared` 의 `DEVICE_MODES` 가 유일한 원천이고,
 *    낡은 `CHECK` 는 새 값을 **런타임에서만** 조용히 거부한다 (server/CLAUDE.md 함정).
 */
ensureColumns('user_devices', { mode: `TEXT` });


// user_devices: 하나의 물리 기기(UUID)는 오직 한 명의 기사 계정에만 귀속되도록 강제
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_device_id_unique ON user_devices(device_id)`);

// ═══════════════════════════════════════
// [4] 차량 및 라우팅 설정
// ═══════════════════════════════════════
db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        vehicle_type TEXT DEFAULT '1t',
        -- 🪦 car_type INTEGER DEFAULT 1,   차종 두 벌의 죽은 쪽 — 원천은 vehicle_type (전수조사 2026-08-21)
        car_fuel TEXT DEFAULT 'GASOLINE',
        car_hipass BOOLEAN DEFAULT 1,
        fuel_price INTEGER DEFAULT 1600,
        fuel_efficiency REAL DEFAULT 10.0,
        default_priority TEXT DEFAULT 'RECOMMEND' CHECK(default_priority IN ('RECOMMEND', 'TIME', 'DISTANCE')),
        avoid_toll BOOLEAN DEFAULT 0,
        home_address TEXT DEFAULT '',
        home_x REAL DEFAULT 0,
        home_y REAL DEFAULT 0,
        alarm_volume INTEGER DEFAULT 50,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);
// 🔔 픽커 알람 요금 하한 (기사님 확정 2026-08-30 · 픽커_수집.md 3단계).
//    인성 min_fare 를 재사용하지 않는다 — 그건 인성 폴백 판정의 값이라 한 값에 두 역할이 된다 (⑤-4 ⑤).
//    픽커는 배송거리가 없어 단가식이 불가능한 판이라 «하한 입력 안 함» 원칙의 전제 밖이다.
ensureColumns('user_settings', { picker_alarm_min_fare: 'INTEGER DEFAULT 10000',
    /**
     * ⏱️ **«주행·정차»로 굳는 데 걸리는 초** (기사님 지시 2026-09-12 · 화면규칙 S16).
     *
     * 판정은 «20km/h↑ 가 N초 이어지면 주행 · 5km/h↓ 가 N초면 정차»다 (`useDriveMotion`).
     *
     * 🔴 **모의 주행에서는 10초를 채울 수가 없다.** 배속이 빠르면 정거장 사이를
     *    2~7초에 지나가고, 나머지는 정차 연기(18초)다 — 그래서 «주행 중»이 한 번도
     *    성립하지 않아 **«주행이면 시트가 내려간다»가 발화 못 했다** (기사님 실측:
     *    빠름 40배로 한 판을 다 돌았는데 하루 종일 `idle`).
     *
     * 기사님: *"10초를 설정할 수 있게 만들면 내가 모의주행할 때는 그걸 줄이고 시험하고
     * **진짜 때는 10으로** 만들면 되니까. 기본값은 10으로 하고 이건 설정창에서 저장"*
     *
     * ⚠️ **정차 연기 18초(`DWELL_TICKS`)와 다른 값이다** — 저것은 «시뮬이 얼마나 서 있나»,
     *    이것은 «몇 초 이어져야 그렇다고 믿나»다 (규칙 ⑤-4 ⑤).
     */
    motion_hold_sec: 'INTEGER DEFAULT 10' });

// ═══════════════════════════════════════
// [5] 콜 콜 잡기용 필터 정보
// ═══════════════════════════════════════
const defaultRates = JSON.stringify({
    "오토바이": 700, "다마스": 800, "라보": 900, "승용차": 900,
    "1t": 1000, "1.4t": 1100, "2.5t": 1200, "3.5t": 1300,
    "5t": 1500, "11t": 2000, "25t": 2500, "특수화물": 3000
});

// v5 마이그레이션: 기본값(3만 원, 반경 10km 등) 적용을 위해 기존 0으로 설정된 테이블 드롭
try {
    const tableInfo = db.prepare("PRAGMA table_info(user_filters)").all() as Array<{ name: string, dflt_value: any }>;
    const minFareCol = tableInfo.find(col => col.name === 'min_fare');
    if (minFareCol && String(minFareCol.dflt_value) === '0') {
        db.exec("DROP TABLE IF EXISTS user_filters");
        console.log("🛠️ [DB Migration] user_filters 테이블 초기값 30000 변경을 위해 재생성 완료");
    }
} catch (e) {
    // 무시
}

/**
 * 📐 **마름모의 모양 — 국면 밖 한 벌** (이식 C3-2 · 2026-09-11 · 명세 §3).
 *
 * 그물의 모양은 «어디로 가는가»가 정하지 «콜을 몇 개 쥐었는가»가 정하지 않는다.
 * 국면과 무관하므로 사용자당 한 행인 여기 산다. **컬럼 목록의 원천은 `QUAD_FIELDS` 표 하나.**
 */
const QUAD_COLS: Record<string, string> = Object.fromEntries(
    QUAD_FIELDS.map(f => [f.col, f.int ? 'INTEGER' : 'REAL'])
);

// 🎛️ 값 다섯(목적지·현위반경·라인반경·목적반경·콜할인율)은 **여기 한 행**에 산다 (이식 C3-3b).
//    2026-08-21 에 국면 행으로 옮겼다가 2026-09-11 에 돌아왔다 — 값이 한 벌이 되었기 때문이다.
// min_fare·max_fare 는 보류 칸 — 앱 피기백 (확정안 ①-삭제 #3, 화물24 단가식 뒤 강등)
db.exec(`
    CREATE TABLE IF NOT EXISTS user_filters (
        user_id TEXT PRIMARY KEY,
        min_fare INTEGER DEFAULT 30000,
        max_fare INTEGER DEFAULT 1000000,
        excluded_keywords TEXT DEFAULT '[]',
        is_active BOOLEAN DEFAULT 0,
        -- 🪦 죽은 칸 정리 (전수조사 2026-08-21 · 기사님 확인 — 기능 만들 때 다시 판다)
        -- is_shared_mode BOOLEAN DEFAULT 0,     항상 0만 저장, 읽기 없음 (세션 파생값)
        -- driver_action TEXT DEFAULT 'WAITING', V6 유물 — 로그인이 하드코딩, 저장 안 함
        vehicle_rates TEXT DEFAULT '${defaultRates}',
        agency_fee_percent REAL DEFAULT 23.0,
        -- 🚫 제외 지역 — «거긴 안 간다». 국면이 아니라 그 지역의 사정이라 여기 한 벌 (이식 C2)
        --    키 문법 S|도 · R|시군구 · D|시군구|동 — 규칙은 shared/callNet.ts 하나
        excluded_regions TEXT DEFAULT '[]',
        ${Object.entries(QUAD_COLS).map(([c, t]) => `${c} ${t}`).join(',\n        ')},
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);
/**
 * 🎛️ **값 다섯의 자리** (이식 C3-3b · 2026-09-11) — 컬럼 목록의 원천은
 *    shared 의 `FILTER_FIELDS` 표 하나다 (표에 한 줄이 늘면 컬럼이 따라온다 · 규칙 ③).
 */
const FILTER_VALUE_COLS: Record<string, string> = Object.fromEntries(
    FILTER_FIELDS.map(f => [f.col, f.text ? 'TEXT' : (f.int ? 'INTEGER' : 'REAL')])
);
/**
 * 📐 **반경 자동 맞춤의 자리** (이식 C4-12 · 2026-09-12).
 *    🔴 **반경 넷은 여기 없다 — 파생이다** (규칙 ③). 사는 것은 «자동인가»와 «기준 거리» 둘.
 *    기본값 40 의 근거는 `shared` 의 `RADIUS_BASE_KM_DEFAULT` 주석에 있다 (실측 역산).
 */
const RADIUS_AUTO_COLS: Record<string, string> = {
    /* 🛣️🔷 노선(1)/동선(0) — 필터 값이다. 관제웹 useState 였던 것을 올렸다 (전수 조사 ①-9) */
    route_mode: 'INTEGER DEFAULT 1',
    radius_auto: 'INTEGER DEFAULT 0',
    radius_base_km: `REAL DEFAULT ${RADIUS_BASE_KM_DEFAULT}`,
};
/**
 * 🚚 **기사님이 «받겠다»고 고른 차종** (이식 C4-6b · 2026-09-12).
 *    🔴 **허용 목록(`allowedVehicleTypes`)은 여기 없다** — 지금도 앞으로도 **파생**이다
 *       (지금 실린 짐 ∩ 이 목록). 빈 배열은 «제한 없음».
 */
ensureColumns('user_filters', {
    accepted_vehicle_types: "TEXT DEFAULT '[]'",
    ...QUAD_COLS,
    ...FILTER_VALUE_COLS,
    ...RADIUS_AUTO_COLS,
    excluded_regions: "TEXT DEFAULT '[]'",
});

// ═══════════════════════════════════════
// [6] (v5) 스캐너가 잡은 콜 및 장소 마스터, 배차 경유지
// ═══════════════════════════════════════
// v5 마이그레이션: 기존 orders 테이블은 형식이 맞지 않으므로 과감히 삭제 후 재성성
try {
    const tableInfo = db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>;
    if (tableInfo.length > 0 && !tableInfo.some(col => col.name === 'userId')) {
        db.exec("DROP TABLE IF EXISTS orders");
        console.log("🛠️ [DB Migration] 레거시 orders 테이블 삭제 완료 (v5 적용)");
    }
} catch (e) {
    // 무시
}

db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        id                    TEXT PRIMARY KEY,
        type                  TEXT NOT NULL DEFAULT 'NEW_ORDER',
        status                TEXT NOT NULL DEFAULT 'ORDER_PRE_SECURED',
        userId                TEXT REFERENCES users(id),
        capturedDeviceId      TEXT,
        capturedAt            TEXT,
        timestamp             TEXT NOT NULL,
        pickup                TEXT NOT NULL,
        dropoff               TEXT NOT NULL,
        fare                  INTEGER DEFAULT 0,
        vehicleType           TEXT,
        paymentType           TEXT,
        billingType           TEXT,
        commissionRate        TEXT,
        tollFare              TEXT,
        tripType              TEXT,
        orderForm             TEXT,
        itemDescription       TEXT,
        detailMemo            TEXT,
        dispatcherName        TEXT,
        dispatcherPhone       TEXT,
        distanceKm            REAL,
        totalDistanceKm       REAL,
        totalDurationMin      INTEGER,
        deliveryDistance      REAL,
        kakaoSoloDistanceKm   REAL,
        kakaoSoloDurationMin  INTEGER,
        kakaoTimeExt          TEXT,
        settlementStatus      TEXT DEFAULT '미정산',
        unpaidAmount          INTEGER DEFAULT 0,
        -- 🪦 정산 페이지용으로 미리 팠던 칸 — 그 기능 만들 때 화면과 같이 다시 판다 (⑤-4 · 전수조사 2026-08-21)
        -- payerName             TEXT,
        -- payerPhone            TEXT,
        -- settlementMemo        TEXT,
        dueDate               TEXT,
        settledAt             TEXT,
        isShared              BOOLEAN DEFAULT 0,
        isExpress             BOOLEAN DEFAULT 0,
        postTime              TEXT,
        scheduleText          TEXT,
        -- 🪦 createdAt DEFAULT 자동값 — 아무도 안 읽음. 시각의 원천은 capturedAt·timestamp
        completedAt           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orders_dashboard ON orders(userId, status, completedAt);

    CREATE TABLE IF NOT EXISTS places (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        address         TEXT,
        x               REAL,
        y               REAL,
        region          TEXT,
        addressDetail   TEXT NOT NULL,
        customerName    TEXT,
        department      TEXT,
        contactName     TEXT,
        phone1          TEXT,
        phone2          TEXT,
        -- 🪦 mileage INTEGER DEFAULT 0,   거래처 마일리지 구상의 흔적 — 기능 만들 때 다시 (전수조사 2026-08-21)
        rating          REAL DEFAULT 3.0,
        blacklistMemo   TEXT,
        visitCount      INTEGER DEFAULT 0,
        createdAt       TEXT DEFAULT (datetime('now', 'localtime')),
        lastVisitedAt   TEXT,
        UNIQUE(addressDetail, customerName)
    );
    CREATE INDEX IF NOT EXISTS idx_places_region ON places(region);
    CREATE INDEX IF NOT EXISTS idx_places_rating ON places(rating);

    CREATE TABLE IF NOT EXISTS orderStops (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        placeId         INTEGER NOT NULL REFERENCES places(id),
        stopType        TEXT NOT NULL,
        -- 🪦 stopOrder INTEGER DEFAULT 0,  경유 순서·요청시각을 여기 두려던 계획 —
        -- requestedTime TEXT,              실제 담당은 세션·step_* 행 (전수조사 2026-08-21)
        customerNameSnapshot TEXT,
        phoneSnapshot        TEXT,
        memo            TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orderStops_orderId ON orderStops(orderId);
    CREATE INDEX IF NOT EXISTS idx_orderStops_placeId ON orderStops(placeId);

    -- 🔄 옛 장부(order_milestones · stop_cargo_reports) CREATE 는 철거됐다 (기사님 확인
    -- 2026-08-21). 신고·마일스톤의 유일한 원천은 여섯 단계 행(step_* 테이블)이다.
    -- 기존 DB 의 실물 테이블은 손으로 DROP 한다 (부팅 경로에서 지우지 않는다).
    SELECT 1
`);

// ── 스키마 진화: 테이블이 모두 만들어진 **뒤에** 돌아야 한다 ──
// 🔄 order_milestones 의 dropStaleCheck 도 철거 (테이블 자체가 은퇴)


/**
 * 🎯 **판정 기준** — 서버가 집어 온 콜에 색을 매기는 값 (2026-08-16 신설).
 *
 * 🔴 **콜 필터(`user_filters`)와 완전히 분리·격리된 테이블이다.** 기사님 확정:
 *    *"필터와 완전 분리 격리되어 각각 따로 작동해야 한다."*
 *      🔍 콜 필터    앱이 콜을 **집기 전**에 쓴다 · 국면별 · **`오늘만` 있다**
 *      🎯 판정 기준  서버가 **집은 뒤**에 쓴다 · 한 벌 · **`오늘만` 없다 (바꾸면 계속)**
 *    앱에는 **내려가지 않는다** — 앱은 색 판정을 하지 않는다 (규칙 ⑤-1).
 *
 * 🔴 **JSON 한 칸이 아니라 컬럼인 이유** (기사님 지적):
 *    *"나중에 라이브 하고 뭔가 필요한 값이 있으면 마이그레이션이 많이 힘들 듯 한데."*
 *    값이 늘면 아래 `ensureColumns` 에 한 줄 + `DEFAULT` 로 **기존 행이 자동으로 채워진다.**
 *    JSON 이면 읽는 곳마다 `?? 기본값` 이 자라는데, 그게 규칙 ③ 이 경고한 바로 그것이다.
 *
 * 🔴 **컬럼 목록의 원천은 `shared` 의 `JUDGMENT_FIELDS` 표 하나다.**
 *    표에 한 줄을 더하면 컬럼도 폼도 기본값도 따라온다 — 여기 손으로 적지 않는다.
 */
const JUDGMENT_COLS: Record<string, string> = Object.fromEntries(
    JUDGMENT_FIELDS.map(f => [f.col, `${f.int ? 'INTEGER' : 'REAL'} DEFAULT ${judgmentDefaults()[f.col]}`])
);

db.exec(`
    CREATE TABLE IF NOT EXISTS user_judgment (
        user_id TEXT PRIMARY KEY,
        ${Object.entries(JUDGMENT_COLS).map(([c, t]) => `${c} ${t}`).join(',\n        ')},
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);
// 표에 줄이 늘면 여기서 기존 행에 컬럼이 붙는다 (DEFAULT 가 값을 채운다)
ensureColumns('user_judgment', JUDGMENT_COLS);

/**
 * 🥣 **국면 행 다섯이 여기 있었다** (`user_filter_phases` · 걷어냄 2026-09-11 · 이식 C3-3b).
 *
 * 행 = 사용자×국면 이었다. C3-3a 에서 **값이 한 벌**이 된 뒤로는 저장할 때마다 **같은 값을
 * 다섯 번 쓰는** 일만 남았고, 기사님 지시로 걷었다 — *"개선되어 중복인건 그냥 삭제 할꺼야."*
 *
 * 🔴 값 다섯은 이제 **`user_filters` 한 행**에 산다 (위 `FILTER_COLS`).
 *    그러면서 **이름 두 벌도 사라졌다** — `detour_allow_km` → `detour_radius_km` 처럼
 *    평면(앱 피기백) 이름으로 통일됐다.
 * ⚠️ **지금은 테스트 단계라 마이그레이션을 안 한다** (루트 CLAUDE.md).
 *    옛 표는 그대로 남아 있어도 **아무도 안 읽는다** — 지우는 것은 손으로, 의도적으로.
 */

/**
 * 🧪 **도달 계수 표본** (필터 확정안 v2 ②값 — 잠정 1.5분/km 를 실측으로 대체하는 절차).
 *
 * 심사 때마다 (현위치→상차지 직선 km, 카카오 실제 분) 쌍을 남긴다.
 * 원래 로그로만 모았는데 **로그는 3일 순환이라 표본이 증발한다** — 그래서 장부에 남긴다.
 * 역산은 `pnpm reach` (단일 계수가 아니라 기본분+거리비례 1차식으로 본다 —
 * 실측: 3.8km 가 4.5분/km, 31.4km 가 1.2분/km. 짧을수록 고정 오버헤드가 지배한다).
 * 🔴 계수 확정 전엔 필터를 조이지 않는다 (기사님 확정 3 — 거르지 않고 딱지만).
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS reach_samples (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        line_km     REAL NOT NULL,
        kakao_min   REAL NOT NULL,
        source      TEXT NOT NULL DEFAULT '심사'
    )
`);
// source: '심사' = 실제 콜 심사에서 잰 것 · 'sweep' = pnpm reach:sweep 의 설계 표본
// (같은 카카오 API 실측이지만 출처를 구분해야 나중에 콜 분포 편향을 따로 볼 수 있다)
ensureColumns('reach_samples', { source: `TEXT NOT NULL DEFAULT '심사'` });

/**
 * 📊 **하루 성과 기록** (필터 확정안 v2 ①-B · 필터 정의 4장).
 * "이 설정이 얼마를 벌었나" — 설정 스냅샷(리셋 전 어제 오늘값)과 결과를 함께 남긴다.
 * 자정 전환(ensureBusinessDay → recordDayResult)이 하루 1회 쓴다. 조회는 운행일지(확정 4).
 * settings 는 기록용 스냅샷이라 JSON 을 허용한다 (판정 근거 detail 과 같은 성격 — 편집 안 함).
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS filter_day_results (
        user_id  TEXT NOT NULL,
        day      TEXT NOT NULL,
        settings TEXT NOT NULL,
        revenue  INTEGER NOT NULL,
        calls    INTEGER NOT NULL,
        cancels  TEXT NOT NULL,
        colors   TEXT NOT NULL,
        PRIMARY KEY (user_id, day),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);

/**
 * 🎨 **판정 스냅샷** — 색은 심사 순간의 결정이고 불변이다 (판정색 확정안 v2 ③ · 기사님 확정).
 * 지금까지 판정은 소켓으로만 날아가 새로고침하면 근거가 사라졌다 (화면은 메모리, 장부는 빔 —
 * 버그 대장 #4·6·8·15 클래스). 카드 접이와 문제지 채점 회귀가 이걸 읽는다.
 * ⚠️ orders FK 없음 — 심사는 KEEP 전이라 orders 행이 아직 없다 (steps 의 FK 교훈).
 */
/**
 * 🔴 **`score` 는 `null` 일 수 있다** (2026-08-29 코드 리뷰에서 잡힘).
 *
 * 잴 수 있는 기준이 하나도 없으면 점수가 없다 — **0 이 아니라 «못 쟀다»** 다
 *    (0 은 «나쁘다»로 읽힌다). 기사님이 가중치를 0 으로 두면 실제로 생긴다.
 * 예전엔 `NOT NULL` 이라 그때 저장이 터졌고, `try` 가 그걸 삼켜
 * **「카카오 연산 실패」로 둔갑**해 판정이 통째로 사라졌다.
 */
const ORDER_JUDGMENTS_SQL = `
    CREATE TABLE IF NOT EXISTS order_judgments (
        orderId  TEXT PRIMARY KEY,
        userId   TEXT NOT NULL,
        color    TEXT NOT NULL CHECK(color IN ('꿀', '보통', '똥', '사고')),
        score    INTEGER,
        detail   TEXT NOT NULL,
        judgedAt TEXT NOT NULL
    )
`;
db.exec(ORDER_JUDGMENTS_SQL);

/**
 * 🔧 **굳어버린 `NOT NULL` 을 푼다** — 행을 먼저 옮긴 뒤에만 옛 표를 지운다
 *    (`dropStaleCheck` 와 같은 방식). 이미 풀려 있으면 아무 일도 안 한다.
 */
function relaxScoreNotNull() {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='order_judgments'")
                  .get() as { sql?: string } | undefined;
    if (!row?.sql || !/score\s+INTEGER\s+NOT NULL/i.test(row.sql)) return;

    const before = (db.prepare(`SELECT COUNT(*) c FROM order_judgments`).get() as any).c;
    db.transaction(() => {
        db.exec(ORDER_JUDGMENTS_SQL.replace('order_judgments', 'order_judgments__new'));
        db.exec(`INSERT INTO order_judgments__new SELECT * FROM order_judgments`);
        db.exec(`DROP TABLE order_judgments`);
        db.exec(`ALTER TABLE order_judgments__new RENAME TO order_judgments`);
    })();
    const after = (db.prepare(`SELECT COUNT(*) c FROM order_judgments`).get() as any).c;
    console.log(`🔧 [스키마] order_judgments.score 를 «못 쟀으면 null» 로 (${before}건 → ${after}건 보존)`);
}
relaxScoreNotNull();

/**
 * 🎛️ **콜 옵션** — 화면의 선택지와 그 값 (2026-08-20 신설).
 *
 * 컬럼 목록은 `shared/src/callOptions.ts` 의 `CALL_OPTION_COLUMNS` 가 유일한 원천이다.
 * 🔴 **화면·판정은 아직 안 읽는다** — 옛 상수로 돈다. 채워만 두고 다음 단계에서 잇는다.
 *    (지금 읽는 것은 `pnpm options` 하나다 — scripts/options.mjs)
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS call_options (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        ${CALL_OPTION_COLUMNS.map(([, col, type]) => `${col} ${type}`).join(',\n        ')},
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, category, key),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);
ensureColumns('call_options', Object.fromEntries(CALL_OPTION_COLUMNS.map(([, c, t]) => [c, t])));

/**
 * 🌱 **시딩 — 옛 상수를 그대로 복사한다.** 손으로 옮겨 적으면 오타 하나로 값이 갈린다.
 *    `INSERT OR IGNORE` 라 **기사님이 고친 값은 덮지 않는다** (한 번 채우면 그 뒤로는 DB 가 진실).
 */
/**
 * 🎛️ **콜 옵션을 읽는다** (2026-08-29 신설 — 시딩만 있고 읽는 길이 없었다).
 *    화면의 칩과 그 분(分)이 여기서 온다. 정차 값의 **원천**이다.
 */
export function loadCallOptions(userId: string): CallOption[] {
    const rows = db.prepare(
        `SELECT * FROM call_options WHERE user_id = ? AND enabled = 1 ORDER BY category, sort_order`
    ).all(userId) as any[];
    return rows.map(r => Object.fromEntries([
        ...CALL_OPTION_COLUMNS.map(([field, col]) => [field, r[col]]),
        // 저장은 0/1, 쓰는 쪽은 참/거짓
        ['enabled', !!r.enabled], ['isDefault', !!r.is_default],
    ]) as any) as CallOption[];
}

/**
 * ⏱️ **정차 값을 한 곳에서 만들어 나른다** (2026-08-29).
 *    표를 매번 읽지 않게 사람마다 기억해 둔다 — 저장하면 `forgetCallOptions` 로 버린다.
 *    🔴 만드는 곳이 여기 하나다 (규칙 ③) — 서버의 모든 정차 계산이 이걸 쓴다.
 */
const dwellRatesCache = new Map<string, ReturnType<typeof dwellRatesOf>>();
export function dwellRatesFor(userId: string) {
    let v = dwellRatesCache.get(userId);
    if (!v) { v = dwellRatesOf(loadCallOptions(userId)); dwellRatesCache.set(userId, v); }
    return v;
}
export function forgetCallOptions(userId: string) { dwellRatesCache.delete(userId); }

export function seedCallOptions(userId: string) {
    const rows = buildDefaultCallOptions();
    const cols = CALL_OPTION_COLUMNS.map(([, c]) => c);
    const stmt = db.prepare(
        `INSERT OR IGNORE INTO call_options (user_id, ${cols.join(', ')}, updated_at)
         VALUES (?, ${cols.map(() => '?').join(', ')}, ?)`);
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
        for (const r of rows) {
            stmt.run(userId, ...CALL_OPTION_COLUMNS.map(([field]) => {
                const v = (r as any)[field];
                return typeof v === 'boolean' ? (v ? 1 : 0) : v;
            }), now);
        }
    });
    tx();
    return rows.length;
}

/**
 * 🪜 **여섯 단계, 여섯 테이블** (2026-08-20 신설).
 *
 * 컬럼은 `shared/src/stepTables.ts` 의 `STEP_TABLES` 가 원천이다 — **여기 손으로 적지 않는다.**
 * 🔴 **첫 행은 KEEP 때 태어나고, 나머지는 각 단계가 끝날 때 태어난다** (출생 모델
 *    2026-08-20 · socketHandlers 참조). 계획(`planned_*`)과 실측(`actual_*`)이
 *    같은 행에 있어 오차를 조인 없이 잰다 — 옛 `stop_cargo_reports` 가 못 하던 것이다.
 * 🔴 **지금은 신고·마일스톤의 유일한 원천이다** — 판정·화면·복구가 전부 이 표를 읽는다
 *    (helpers · OrderEvaluator · filterManager · dispatchEngine · socketHandlers · stepSeeder).
 *    ⚠️ 예전 주석은 *"행은 KEEP 때 생긴다"* · *"아직 아무도 안 읽는다"* 였는데 **둘 다 낡았다**
 *       (2026-08-29 정정). «아무도 안 읽는다»를 믿고 이 표를 함부로 바꾸면 전부 흔들린다
 */
for (const t of STEP_TABLES) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${t.table} (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            orderId TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            userId  TEXT NOT NULL,
            ${t.columns.map(([, col, type]) => `${col} ${type}`).join(',\n            ')},
            recorded_at TEXT NOT NULL,
            UNIQUE(orderId)
        )
    `);
    ensureColumns(t.table, Object.fromEntries(t.columns.map(([, c, ty]) => [c, ty])));
}

// 어느 배차망에서 온 콜인가 (insung/hwamul24/kakaopicker) — 배차망별 콜 검색·분석의 근거 (기사님 2026-08-17)
ensureColumns('orders', { targetApp: 'TEXT',
    /**
     * 🗺️ **한 번 잰 경로를 다시 재지 않는다** (기사님 확정 2026-08-23).
     *
     * 기사님: *"확정된 경로를 새로 받아올 필요가 없다 생각되어서 하는 질문이야."*
     *
     * 거리·시간·`routeComputedAt` 은 저장하면서 **궤적만 메모리에 뒀다.** 그래서 서버가
     * 재시작할 때마다 `restoreAndRecalculateSession` 이 카카오를 다시 불렀다
     * (2026-08-22 하루에 여섯 번 재시작 = 여섯 번 재계산).
     *
     * JSON 문자열로 넣는다 — 좌표 배열이라 칸을 쪼갤 이유가 없고, 읽는 쪽은 한 곳뿐이다.
     */
    routePolyline: 'TEXT',
    /**
     * 🎨 **구간 경계** — `routePolyline` 안에서 각 구간이 끝나는 자리 (JSON 숫자 배열 · 이식 B1).
     *    궤적과 **같은 운명**이라야 한다 — 선만 살아남고 경계가 없으면 지도가 한 색으로 물러난다.
     *    선을 한 벌 더 저장하지 않는 이유는 `shared/src/sectionLine.ts` 에 있다.
     */
    sectionEnds: 'TEXT',
    /**
     * 🧭 **구간 주인** — 구간마다 어느 정거장(콜)인가 (JSON · 이식 B2).
     *    2026-08-21 에 메모리에만 두었더니 **서버가 재시작할 때마다 사라졌다** — 궤적은
     *    살아남는데 «누구의 구간인가»만 없어져서 지도가 색을 잃는다. 셋은 같은 운명이다.
     */
    sectionStops: 'TEXT',
    // ⚓ 타임라인 추정 약속의 기준 = 카카오호출시점 — 메모리에만 두면 서버 재시작에 모든 추정이 지금 시각으로 리셋된다
    routeComputedAt: 'TEXT',
    // 🖱️ 잡은 방식(자동·알람·직접) — 6하원칙 «어떻게», 기록 전용 (보호는 matchType · #75 · 픽커_수집.md §6-전)
    capturedVia: 'TEXT',
    /**
     * 🚚 **배송거리** — 앱이 인성 화면에서 읽어 보내는 값 (리스트 두 번째 숫자).
     *    합짐 콜의 단독 주행 추정 입력이다 (`soloMinutesOf`).
     *
     * 🔴 `CREATE TABLE IF NOT EXISTS` 에만 적으면 **기존 DB 에는 안 붙는다.**
     *    그 함정이 CLAUDE.md 에 적혀 있는데 2026-08-26 에 또 밟았다 —
     *    `tsc`·`jest` 는 통과하고 **실서버에서만** `no such column` 으로 터진다.
     */
    deliveryDistance: 'REAL' });
// ⚠️ intel 의 ensureColumns 는 여기 있으면 안 된다 — 그 표는 아래 [7] 에서 만들어진다.
//    `ensureColumns` 는 표가 없으면 조용히 return 하므로(위 :32), 빈 DB 첫 부팅에서
//    targetApp 이 안 붙은 채 scrap.ts 가 INSERT 해 `no such column` 으로 터졌다.
//    → CREATE 문 바로 뒤로 옮겼다 (2026-08-29 · 검사 `schemaOrder.test.ts`)

/**
 * 🛰️ **주행 궤적** (기사님 확정 2026-08-26).
 *
 * 좌표는 그동안 소켓으로 흘려보내고 **메모리에만 살았다.** 필드테스트 1·2회차 둘 다
 * 궤적을 못 남겨(«발견 3»), 2회차에서 **상차지 5곳 중 3곳이 GPS 자동 감지 실패**했는데
 * **몇 미터 차이로 빗나갔는지를 몰랐다.**
 *
 * 기사님이 원하는 것은 사후 분석만이 아니다 — *"네비가 가리키는 경로를 놓쳐 지나쳤을 때
 * 얼마나 우회하게 되는지, 약속에 늦으면 전화해서 고쳐야 하니까."* 그러려면
 * **부여받은 경로와 실제 궤적을 대조**해야 하고, 그 재료가 이 표다.
 *
 * 🔴 비용을 눌러 둔다 (서버 메모리 911MB · 가용 345MB):
 *    50m 또는 15초 문턱 · 20점씩 일괄 쓰기 · **7일 보관** → 상한 5MB
 *    (`gpsTrackStore.ts` 에 규칙이 있다. 여기는 그릇만 만든다)
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS gps_tracks (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id   TEXT    NOT NULL,
        at_ms     INTEGER NOT NULL,
        x         REAL    NOT NULL,
        y         REAL    NOT NULL,
        source    TEXT,
        speed_kmh REAL,
        order_id  TEXT,
        stop_type TEXT
    )
`);
/**
 * 🔴 위 `CREATE TABLE IF NOT EXISTS` 는 **기존 표에 칸을 안 붙인다.**
 *    라이브에는 2026-08-27 부터 이 표가 이미 있으므로 `stop_type` 은 여기서만 생긴다
 *    (server/CLAUDE.md 함정 — `tsc`·`jest` 는 통과하고 런타임에서만 `no such column`).
 */
ensureColumns('gps_tracks', { stop_type: 'TEXT',
    /**
     * 🎭 **모의 배속** — 그때 몇 배로 돌렸나 (현황판 실측 2026-09-12).
     *
     * 🔴 **`speed_kmh` 는 이미 나눈 «실제 속도»다.** 전에는 배속이 그대로 기록돼
     *    평균 4,251km/h 짜리 궤적이 남았고, 나중에 «여기서 막혔나»를 읽을 수가 없었다.
     *    배속은 «시간을 빨리 돌리는 것»이지 «차가 빨라지는 것»이 아니다.
     * 🔴 **한 칸에 섞지 않는다** — «얼마로 달렸나»와 «얼마로 돌렸나»는 다른 질문이다
     *    (규칙 ⑤-4 ⑤). 실 GPS 는 늘 1 이다.
     */
    speed_multiplier: 'REAL DEFAULT 1' });
// 정리(부팅 때 7일 넘은 것 삭제)와 조회(주행 구간 뽑기)가 둘 다 시각으로 훑는다
db.exec(`CREATE INDEX IF NOT EXISTS idx_gps_tracks_at ON gps_tracks(at_ms)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_gps_tracks_user_at ON gps_tracks(user_id, at_ms)`);
// 🔄 stop_cargo_reports 의 dropStaleCheck 도 철거 (테이블 은퇴 — 2026-08-21)





// ═══════════════════════════════════════
// [6.5] ORDER_ 라이프사이클 마이그레이션 (V7)
// 기존 소문자 레거시 status 값을 새 ORDER_XXX 규격으로 일괄 변환
// ═══════════════════════════════════════
try {
    const legacyCheck = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status IN ('pending', 'confirmed', 'completed', 'canceled', 'evaluating_basic', 'evaluating_detailed')").get() as { cnt: number };
    if (legacyCheck && legacyCheck.cnt > 0) {
        db.exec(`
            UPDATE orders SET status = 'ORDER_CONFIRMED'           WHERE status = 'confirmed';
            UPDATE orders SET status = 'ORDER_COMPLETED'           WHERE status = 'completed';
            UPDATE orders SET status = 'SAFE_CANCEL'            WHERE status = 'canceled';
            UPDATE orders SET status = 'ORDER_PRE_SECURED'         WHERE status IN ('pending', 'evaluating_basic');
            UPDATE orders SET status = 'ORDER_SECURED_EVALUATING'  WHERE status = 'evaluating_detailed';
        `);
        console.log(`🛠️ [DB Migration V7] 레거시 status 값 ${legacyCheck.cnt}건을 ORDER_XXX 규격으로 일괄 변환 완료`);
    }
} catch (e) {
    // 마이그레이션 실패 시 무시 (테이블이 아직 없는 경우 등)
}
// ═══════════════════════════════════════
// [7] (기존 레거시) 스캐너가 버린 데이터
// ═══════════════════════════════════════
db.exec(`
    CREATE TABLE IF NOT EXISTS intel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        pickup TEXT NOT NULL,
        dropoff TEXT NOT NULL,
        fare INTEGER DEFAULT 0,
        timestamp TEXT NOT NULL,
        user_id TEXT REFERENCES users(id),
        device_id TEXT,
        targetApp TEXT
    )
`);
// 기존 DB 에는 CREATE 가 안 도니 여기서 붙인다 — **CREATE 뒤여야 한다** (위 [3] 끝 주석 참조)
ensureColumns('intel', { targetApp: 'TEXT',
    // 🌐 픽커 수집 필드 셋 (기사님 확정 2026-08-30 · 픽커_수집.md §5-①) — 인성 콜은 null
    itemSize: 'TEXT', pickupDistanceKm: 'REAL', tagsText: 'TEXT',
    /**
     * 📄 **픽커 상세 화면의 글자 통째로** (기사님 확정 2026-09-02).
     *
     * 픽커 상세에는 리스트에 없는 것이 다 있다 — 배송 km · 「17:04까지 픽업」·
     * 「17:18까지 배송」· 물품 규격 · 수익 분해 · 오더번호. 그런데 **어떤 칸으로 나눌지는
     * 아직 모른다** (수락 뒤 화면을 실물로 못 봤다).
     *
     * 기사님: *"픽커의 고유 값들은 따로 보관한다. 일단은 임시 DB 에. 그러고 다녀와서
     * 그걸 어떻게 테이블 구분을 할 건지 다시 고민한다. 그때 구조를 생각한다."*
     *
     * → 그래서 **지금은 나누지 않고 원문 한 칸으로 받는다.** 미리 나누면 실물을 본 뒤
     *   «이렇게 나눴어야 했네» 하고 갈아엎게 된다. 원문이 있으면 나중에 무엇이든 뽑는다.
     * ⚠️ 인성 콜은 늘 null 이다 — 인성은 상세를 팝업 3장으로 따로 모은다.
     */
    rawDetailText: 'TEXT',
    /**
     * 📋 **리스트 화면이 주는 것을 버리지 않는다** (기사님 지시 2026-09-12).
     *
     * 기사님: *"차종뿐 아니고 상차지거리와 배송거리도 보내고 있고 기타 급송인지도
     * 보내고 있는데.. 그걸 다 받아야 하는 거 아닌가?"*
     *
     * 🔴 **앱은 이미 다 보내고 있었다.** 리스트 한 줄에서 여섯 칸을 읽어 그릇
     *    (`SimplifiedOfficeOrder`)에 채워 올리는데, **서버 INSERT 가 아홉 칸을 버렸다.**
     *    그래서 현황판 검산이 «요율(배송거리 없음)·차종»을 «못 잰 축»으로 적고 있었고,
     *    규칙대로 걸러진 콜이 화면에 «통과인데 안 잡음»으로 보였다 (실측 2026-09-12 12:33).
     *
     * 🔴 **배차망마다 칸을 따로 파지 않는다** (기사님 지시: *"나중에 24시 등 다른 배송망일
     *    때도 충돌 없이"*). 셋이 **같은 그릇**을 채우고 망마다 채우는 칸만 다르다 —
     *    24시는 Km 가 하나라 `deliveryDistanceKm` 이 null 이고, 픽커만 `itemSize` 를 준다.
     *    **빈 칸은 «그 망이 안 주는 것»**이고, 어느 망인지는 `targetApp` 열이 답한다.
     *    `insung_vehicle_type` 처럼 칸 이름에 망을 박으면 그 순간 칸이 두 벌이 된다.
     */
    vehicleType: 'TEXT',
    /** 🚚 배송거리(상차→하차 km) — 단가 판정 `요금 ≥ 배송거리 × 단가` 의 분모. 24시는 null */
    deliveryDistanceKm: 'REAL',
    /**
     * ⏰ **지역명 앞에 붙은 말 — 통째로** (`급송` · `오후4시41` · `낼09시` · `11일)09시`).
     *
     * 🔴 **여기에 «당착/내착»이 섞여 있다** (기사님 2026-09-12: *"인성에도 당착 내착이
     *    다른 말로 들어가 있을 거야.. 그것도 받는 그릇이 있어야 해"*). 24시는 `[당착]`
     *    뱃지로 따로 오는데, 인성은 **한 덩어리 문자열**이라 「언제까지·몇 시·급송인가」
     *    셋이 한 칸에 있다 (규칙 ⑤-4 ⑤ 가 말하는 «한 값이 여러 사실을 답하는» 모양).
     *
     * → **지금은 나누지 않고 원문으로 받는다** — 픽커 `rawDetailText` 와 같은 판단이다.
     *   무엇으로 나눌지는 **실제로 어떤 말이 오는지 세어 본 뒤** 기사님과 정한다
     *   (규칙 ⑤-4 ②: 근거 없이 기본값을 짓지 않는다). 원문이 있으면 나중에 무엇이든 뽑는다.
     */
    scheduleText: 'TEXT',
    /** 🕐 콜이 리스트에 오른 시각 (`HH:mm`) — 앱이 화면에서 읽은 그대로 */
    postTime: 'TEXT',
    /** 📄 리스트 한 줄 원문 — «왜 이렇게 판정했나»를 나중에 되짚는 유일한 증거 */
    rawText: 'TEXT',
    /** 📍 좌표 넷 — 시뮬이 주는 값. 실콜에는 없다(null) */
    pickupX: 'REAL', pickupY: 'REAL', dropoffX: 'REAL', dropoffY: 'REAL',
    /**
     * 🗳️ **앱이 이 콜을 어떻게 판정했나** (현황판 의뢰 2026-09-12).
     *
     *   `pass` 통과 · `vehicle` 차종 · `region` 도착지 · `fare` 요금/단가 ·
     *   `pickup` 상차거리 · `blacklist` 제외어 · `routeOrder` 경로순서 · `locked` 잠김
     *
     * 🔴 **화면이 판정을 다시 계산하지 않게 하려는 것이다.** 현황판이 앱 판정식을 TS 로
     *    옮겨 적은 **사본**으로 「🗑️ 버린 콜」을 그리고 있었고, 그것이 이미 갈라졌다 —
     *    앱은 요율 모델이 서면 `minFare` 를 안 보는데 사본은 그것만 봐서 **가짜 «통과»**.
     *    값이 오면 그 사본이 통째로 사라진다.
     *
     * ⚠️ **못 정하면 null** (구필터·값 없음 · 판정을 안 싣는 배차망). 화면은 «못 잼»으로
     *    그린다 — 지어내지 않는다 (규칙 ④).
     */
    verdict: 'TEXT' });

// ═══════════════════════════════════════
// [8] 카카오 지오코딩 영구 캐시 (장소 사전)
// 용도: API 비용 절감 + 미래 운행일지/장소 평점 데이터 기반
// ═══════════════════════════════════════
db.exec(`
    CREATE TABLE IF NOT EXISTS geocode_cache (
        query      TEXT PRIMARY KEY,
        x          REAL NOT NULL,
        y          REAL NOT NULL,
        hit_count  INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        last_used  TEXT DEFAULT (datetime('now', 'localtime'))
    )
`);

// ═══════════════════════════════════════
// [9] 취소 예산 판 나누기 — **리셋 시각만** 저장한다 (기사님 확정 2026-08-23)
//
// 🔴 카운트는 저장하지 않는다. 장부(`orders` 의 SAFE_CANCEL)에서 세는 **파생값**이고,
//    파생값을 저장하면 두 그릇이 갈라진다 (규칙 ③). 여기 사는 것은 **사건** —
//    "이 시각에 한 판이 끝났다" 하나뿐이다.
//
// 한 판 = `CANCEL_BUDGET_PER_ROUND`(10)회. 다 쓰면 알리고 새 판이 열린다.
// 판수가 남으므로 총량은 사라지지 않는다 — 필터_정의 §2 의 취지를 지키는 방식이다.
// ═══════════════════════════════════════
db.exec(`
    CREATE TABLE IF NOT EXISTS cancel_budget_resets (
        user_id  TEXT NOT NULL,
        app      TEXT NOT NULL,
        reset_at TEXT NOT NULL
    )
`);

export default db;
