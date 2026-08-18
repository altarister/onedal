import { JUDGMENT_FIELDS, judgmentDefaults } from "@onedal/shared";
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
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, device_id)
    )
`);

// user_devices: 하나의 물리 기기(UUID)는 오직 한 명의 기사 계정에만 귀속되도록 강제
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_device_id_unique ON user_devices(device_id)`);

// ═══════════════════════════════════════
// [4] 차량 및 라우팅 설정
// ═══════════════════════════════════════
db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        vehicle_type TEXT DEFAULT '1t',
        car_type INTEGER DEFAULT 1,
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

// v6 마이그레이션: driver_action 컬럼 추가 (도메인 모델 V2)
try {
    const tableInfo = db.prepare("PRAGMA table_info(user_filters)").all() as Array<{ name: string }>;
    if (tableInfo.length > 0 && !tableInfo.some(col => col.name === 'driver_action')) {
        db.exec("ALTER TABLE user_filters ADD COLUMN driver_action TEXT DEFAULT 'WAITING'");
        console.log("🛠️ [DB Migration V6] user_filters에 driver_action 컬럼 추가 완료");
    }
} catch (e) {
    // 무시 (테이블이 아직 없는 경우 CREATE TABLE에서 생성됨)
}

// v7 마이그레이션: call_discount_pct(콜할인율) 컬럼 추가 — 단가 판정 모델 (docs/필터_재설계_명세.md)
// 기본 10 = 시세 대비 -10% 까지 허용. 100 = "전부"(금액 무관).
try {
    const tableInfo = db.prepare("PRAGMA table_info(user_filters)").all() as Array<{ name: string }>;
    if (tableInfo.length > 0 && !tableInfo.some(col => col.name === 'call_discount_pct')) {
        db.exec("ALTER TABLE user_filters ADD COLUMN call_discount_pct INTEGER DEFAULT 10");
        console.log("🛠️ [DB Migration V7] user_filters에 call_discount_pct 컬럼 추가 완료");
    }
} catch (e) {
    // 무시 (테이블이 아직 없는 경우 CREATE TABLE에서 생성됨)
}

// v8 마이그레이션: phase_settings(국면별 필터 설정) 컬럼 추가
// docs/필터_재설계_명세.md §2-4 — 다섯 국면이 각자 값을 기억한다.
// 값 채우기(기존 평면값 → first 국면)는 userSessionStore 가 로드할 때 한다 —
// 여기서는 컬럼만 만든다 (부팅 경로에서 데이터를 가공하지 않는다).
try {
    const tableInfo = db.prepare("PRAGMA table_info(user_filters)").all() as Array<{ name: string }>;
    if (tableInfo.length > 0 && !tableInfo.some(col => col.name === 'phase_settings')) {
        db.exec("ALTER TABLE user_filters ADD COLUMN phase_settings TEXT DEFAULT ''");
        console.log("🛠️ [DB Migration V8] user_filters에 phase_settings 컬럼 추가 완료");
    }
} catch (e) {
    // 무시 (테이블이 아직 없는 경우 CREATE TABLE에서 생성됨)
}

db.exec(`
    CREATE TABLE IF NOT EXISTS user_filters (
        user_id TEXT PRIMARY KEY,
        destination_city TEXT DEFAULT '파주',
        destination_radius_km INTEGER DEFAULT 10,
        detour_radius_km INTEGER DEFAULT 5,
        min_fare INTEGER DEFAULT 30000,
        max_fare INTEGER DEFAULT 1000000,
        pickup_radius_km REAL DEFAULT 10,
        excluded_keywords TEXT DEFAULT '[]',
        is_active BOOLEAN DEFAULT 0,
        is_shared_mode BOOLEAN DEFAULT 0,
        load_state TEXT DEFAULT 'EMPTY',
        driver_action TEXT DEFAULT 'WAITING',
        call_discount_pct INTEGER DEFAULT 10,
        phase_settings TEXT DEFAULT '',
        vehicle_rates TEXT DEFAULT '${defaultRates}',
        agency_fee_percent REAL DEFAULT 23.0,
        max_discount_percent REAL DEFAULT 10.0,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);

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
        kakaoSoloDistanceKm   REAL,
        kakaoSoloDurationMin  INTEGER,
        kakaoTimeExt          TEXT,
        settlementStatus      TEXT DEFAULT '미정산',
        unpaidAmount          INTEGER DEFAULT 0,
        payerName             TEXT,
        payerPhone            TEXT,
        dueDate               TEXT,
        settlementMemo        TEXT,
        settledAt             TEXT,
        isShared              BOOLEAN DEFAULT 0,
        isExpress             BOOLEAN DEFAULT 0,
        postTime              TEXT,
        scheduleText          TEXT,
        createdAt             TEXT DEFAULT (datetime('now', 'localtime')),
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
        mileage         INTEGER DEFAULT 0,
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
        stopOrder       INTEGER DEFAULT 0,
        customerNameSnapshot TEXT,
        phoneSnapshot        TEXT,
        requestedTime   TEXT,
        memo            TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orderStops_orderId ON orderStops(orderId);
    CREATE INDEX IF NOT EXISTS idx_orderStops_placeId ON orderStops(placeId);

    -- [Phase 8.2] 운행 마일스톤(상차/하차 보고) 이력
    --
    -- 같은 보고가 여러 경로로 들어온다. 앱이 화면 변화를 감지(AUTO_SCRAPE)한 직후
    -- 기사님이 관제탑에서도 누르면(MANUAL_WEB) 두 번 들어온다.
    -- UNIQUE(orderId, milestone) 로 **DB 레벨에서 멱등성을 보장**한다.
    -- 애플리케이션 체크만 두면 동시 요청에서 뚫린다.
    --
    -- occurredAt 은 "실제로 일어난 시각", recordedAt 은 "서버가 받은 시각"이다.
    -- 통신이 끊겼다 복구되면 둘이 크게 벌어지므로 분리해서 남긴다.
    CREATE TABLE IF NOT EXISTS order_milestones (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        userId          TEXT NOT NULL,
        milestone       TEXT NOT NULL,   -- MILESTONES (@onedal/shared)
        source          TEXT NOT NULL,   -- MILESTONE_SOURCES (@onedal/shared)
        occurredAt      TEXT NOT NULL,   -- 실제로 일어난 시각 (버튼을 누른 때)
        predictedAt     TEXT,            -- 그때 우리가 예상했던 시각 — 오차 계산용
        recordedAt      TEXT NOT NULL,   -- 서버가 받은 시각
        UNIQUE(orderId, milestone)
    );
    CREATE INDEX IF NOT EXISTS idx_milestones_orderId ON order_milestones(orderId);
    CREATE INDEX IF NOT EXISTS idx_milestones_user_time ON order_milestones(userId, occurredAt);

    -- [Phase 8.4] 정거장별 화물 정보. **같은 항목을 두 번 기록한다.**
    --   kind='DECLARED' 통화로 들은 값 (상차 전)  — 합짐 판단의 '예측'
    --   kind='ACTUAL'   현장에서 확인한 값        — 잔여 공간의 '확정'
    -- 둘의 차이가 곧 의사결정 근거다. 신고 "박스 1개"인데 실제 "파렛트 3개"면
    -- 퀵사무실에 전화해 수행 여부를 다시 정해야 한다.
    --
    -- 크기·개수는 kg 가 아니라 **적재 점수(1t=30점)** 축으로 받는다.
    -- 통화 중에 한 손으로 3초 안에 입력해야 하므로 숫자 타이핑을 요구하지 않는다.
    CREATE TABLE IF NOT EXISTS stop_cargo_reports (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        userId      TEXT NOT NULL,
        stopType    TEXT NOT NULL,   -- 'pickup' | 'dropoff'
        kind        TEXT NOT NULL,   -- 'DECLARED'(통화) | 'ACTUAL'(현장)
        unit        TEXT,        -- 파레트 | 라면박스 | 소 | 중 | 대 | 초과
        sizeClass   TEXT,        -- (구) 소 | 중 | 대 | 초과 — unit 으로 대체됨
        quantity    INTEGER,     -- 개수
        handling    TEXT,        -- 지게차 | 수작업 | 검수 (호이스트는 2026-08-18 제거)
        promisedAt  TEXT,        -- 약속·예정 시각 (적요의 12:42상차 등)
        deadlineAt  TEXT,        -- 마감 시각 (늦어도 언제까지). 합짐 우회 허용치를 정한다
        tags        TEXT,        -- 화물 성질 JSON 배열 (식료품·냉장·파손주의 등)
        memo        TEXT,
        recordedAt  TEXT NOT NULL,
        UNIQUE(orderId, stopType, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_cargo_orderId ON stop_cargo_reports(orderId);
`);

// ── 스키마 진화: 테이블이 모두 만들어진 **뒤에** 돌아야 한다 ──
dropStaleCheck('order_milestones', `
    CREATE TABLE order_milestones (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        userId          TEXT NOT NULL,
        milestone       TEXT NOT NULL,
        source          TEXT NOT NULL,
        occurredAt      TEXT NOT NULL,
        predictedAt     TEXT,
        recordedAt      TEXT NOT NULL,
        UNIQUE(orderId, milestone)
    )`, [
    `CREATE INDEX IF NOT EXISTS idx_milestones_orderId ON order_milestones(orderId)`,
    `CREATE INDEX IF NOT EXISTS idx_milestones_user_time ON order_milestones(userId, occurredAt)`,
]);

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

ensureColumns('order_milestones', { predictedAt: 'TEXT' });
// 어느 배차망에서 온 콜인가 (insung/hwamul24) — 배차망별 콜 검색·분석의 근거 (기사님 2026-08-17)
ensureColumns('orders', { targetApp: 'TEXT' });
ensureColumns('intel', { targetApp: 'TEXT' });
// 🕒 도착 약속 — "몇 시까지 갈게요" (기사님 확정 2026-08-18). 완료 시각은 저장하지 않고 파생한다
ensureColumns('stop_cargo_reports', { promisedArrivalAt: 'TEXT', protections: 'TEXT', afterworks: 'TEXT',
    promisedArrivalFromAt: 'TEXT' });   // 🔒 보호(복수) — tags 와 같은 JSON. 부터(하한)는 2026-08-19 구간 약속
/**
 * 🔴 2026-08-12 — 옛 DB 의 `stop_cargo_reports` 에 CHECK 제약이 굳어 있었다.
 *
 *     kind TEXT NOT NULL CHECK(kind IN ('DECLARED', 'ACTUAL'))
 *
 * 파일 위쪽 주석이 경고해 둔 바로 그 함정인데, `order_milestones` 에만 걸고
 * 이 테이블은 빠뜨렸다. 그래서 `kind: 'SKIPPED'`(통화 건너뛰기)를 저장하려는 순간
 * **`CHECK constraint failed` 로 조용히 실패**했다 (safeOn 이 잡아 서버는 살았다).
 *
 * 허용값 목록이 `@onedal/shared` 의 `CargoReportKind` 와 **두 번째 진실 공급원**이 된다.
 * 검증은 애플리케이션 한 곳에서만 한다.
 */
dropStaleCheck('stop_cargo_reports', `
    CREATE TABLE stop_cargo_reports (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        userId      TEXT NOT NULL,
        stopType    TEXT NOT NULL,   -- 'pickup' | 'dropoff'
        kind        TEXT NOT NULL,   -- 'DECLARED'(통화) | 'ACTUAL'(현장) | 'SKIPPED'(통화 건너뜀)
        unit        TEXT,
        sizeClass   TEXT,
        quantity    INTEGER,
        handling    TEXT,
        promisedAt  TEXT,
        deadlineAt  TEXT,
        onwardDeadlineAt TEXT,
        tags        TEXT,
        memo        TEXT,
        recordedAt  TEXT NOT NULL,
        UNIQUE(orderId, stopType, kind)
    )
`, [`CREATE INDEX IF NOT EXISTS idx_cargo_orderId ON stop_cargo_reports(orderId)`]);

ensureColumns('stop_cargo_reports', { unit: 'TEXT', deadlineAt: 'TEXT', tags: 'TEXT',
    // 상차지 통화에서 함께 들은 하차지 도착 예정 (하차지 기록으로 저장하면 단계를 건너뛰게 된다)
    onwardDeadlineAt: 'TEXT' });


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
        device_id TEXT
    )
`);

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

export default db;
