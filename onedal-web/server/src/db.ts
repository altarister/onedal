import { JUDGMENT_FIELDS, judgmentDefaults, CALL_OPTION_COLUMNS, buildDefaultCallOptions,
         STEP_TABLES, FILTER_FIELDS } from "@onedal/shared";
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

// 🎛️ 국면 옵션(노선·반경·할인율)은 여기 없다 — 원천은 user_filter_phases 행이다
// (필터 확정안 v2 ④ · 2026-08-21 옛 blob·평면 칸 손 DROP 완료).
// min_fare·max_fare 는 보류 칸 — 앱 피기백 (확정안 ①-삭제 #3, 화물24 단가식 뒤 강등)
db.exec(`
    CREATE TABLE IF NOT EXISTS user_filters (
        user_id TEXT PRIMARY KEY,
        min_fare INTEGER DEFAULT 30000,
        max_fare INTEGER DEFAULT 1000000,
        excluded_keywords TEXT DEFAULT '[]',
        is_active BOOLEAN DEFAULT 0,
        is_shared_mode BOOLEAN DEFAULT 0,
        driver_action TEXT DEFAULT 'WAITING',
        vehicle_rates TEXT DEFAULT '${defaultRates}',
        agency_fee_percent REAL DEFAULT 23.0,
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
 * 🎛️ **국면 옵션 — 행 = 사용자×국면** (필터 확정안 v2 · 2026-08-21 전환 완료).
 *
 * **국면 옵션의 유일한 원천이다** (옛 `phase_settings` blob 은 병행 비교 후 손 DROP).
 * **컬럼 목록의 원천은 shared 의 `FILTER_FIELDS` 표 하나** (user_judgment 와 같은
 * 문법 — 표에 한 줄이 늘면 컬럼·폼이 따라온다).
 */
const FILTER_PHASE_COLS: Record<string, string> = Object.fromEntries(
    FILTER_FIELDS.map(f => [f.col, f.text ? 'TEXT' : (f.int ? 'INTEGER' : 'REAL')])
);
db.exec(`
    CREATE TABLE IF NOT EXISTS user_filter_phases (
        user_id TEXT NOT NULL,
        phase   TEXT NOT NULL CHECK(phase IN ('first','merge','drive','local','home')),
        ${Object.entries(FILTER_PHASE_COLS).map(([c, t]) => `${c} ${t}`).join(',\n        ')},
        PRIMARY KEY (user_id, phase),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);
ensureColumns('user_filter_phases', FILTER_PHASE_COLS);

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
db.exec(`
    CREATE TABLE IF NOT EXISTS order_judgments (
        orderId  TEXT PRIMARY KEY,
        userId   TEXT NOT NULL,
        color    TEXT NOT NULL CHECK(color IN ('꿀', '보통', '똥', '사고')),
        score    INTEGER NOT NULL,
        detail   TEXT NOT NULL,
        judgedAt TEXT NOT NULL
    )
`);

/**
 * 🎛️ **콜 옵션** — 화면의 선택지와 그 값 (2026-08-20 신설).
 *
 * 컬럼 목록은 `shared/src/callOptions.ts` 의 `CALL_OPTION_COLUMNS` 가 유일한 원천이다.
 * 🔴 **아직 아무도 안 읽는다** — 화면·판정은 옛 상수로 돈다. 채워만 두고 다음 단계에서 잇는다.
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
 * 🔴 **행은 KEEP 때 생기고 상태만 바뀐다** — 계획(`planned_*`)과 실측(`actual_*`)이
 *    같은 행에 있어 오차를 조인 없이 잰다. 지금 `stop_cargo_reports` 가 못 하는 것이다.
 * 🔴 **아직 아무도 안 읽는다** — 여섯을 다 만들어 모양을 보고 합칠지 정한다.
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

// 어느 배차망에서 온 콜인가 (insung/hwamul24) — 배차망별 콜 검색·분석의 근거 (기사님 2026-08-17)
ensureColumns('orders', { targetApp: 'TEXT',
    // ⚓ 타임라인 추정 약속의 닻 — 메모리에만 두면 서버 재시작에 모든 추정이 지금 시각으로 리셋된다
    routeComputedAt: 'TEXT' });
ensureColumns('intel', { targetApp: 'TEXT' });
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
