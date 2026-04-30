import Database from "better-sqlite3";
import path from "path";

// .env 또는 서버 환경에서 주입된 DB_FILE 환경 변수 사용 (기본값: local.db)
const dbFileName = process.env.DB_FILE || "local.db";
const dbPath = path.resolve(__dirname, `../${dbFileName}`);
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

console.log(`📂 SQLite DB 준비 완료: ${dbPath}`);

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
// [5] 콜 사냥용 필터 정보
// ═══════════════════════════════════════
const defaultRates = JSON.stringify({
    "오토바이": 700, "다마스": 800, "라보": 900, "승용차": 900,
    "1t": 1000, "1.4t": 1100, "2.5t": 1200, "3.5t": 1300,
    "5t": 1500, "11t": 2000, "25t": 2500, "특수화물": 3000
});

db.exec(`
    CREATE TABLE IF NOT EXISTS user_filters (
        user_id TEXT PRIMARY KEY,
        destination_city TEXT DEFAULT '',
        destination_radius_km INTEGER DEFAULT 0,
        corridor_radius_km INTEGER DEFAULT 0,
        min_fare INTEGER DEFAULT 0,
        max_fare INTEGER DEFAULT 0,
        pickup_radius_km REAL DEFAULT 0,
        excluded_keywords TEXT DEFAULT '[]',
        is_active BOOLEAN DEFAULT 0,
        is_shared_mode BOOLEAN DEFAULT 0,
        load_state TEXT DEFAULT 'EMPTY',
        vehicle_rates TEXT DEFAULT '${defaultRates}',
        agency_fee_percent REAL DEFAULT 23.0,
        max_discount_percent REAL DEFAULT 10.0,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);

// ═══════════════════════════════════════
// [6] (기존 레거시) 스캐너가 잡은 본콜
// ═══════════════════════════════════════
db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        pickup TEXT NOT NULL,
        dropoff TEXT NOT NULL,
        fare INTEGER DEFAULT 0,
        timestamp TEXT NOT NULL,
        status TEXT DEFAULT 'pending'
    )
`);

// orders 테이블에 user_id 컬럼이 있는지 확인 후 없으면 추가 (마이그레이션)
const orderTableInfo = db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>;
const hasUserIdInOrders = orderTableInfo.some(col => col.name === 'user_id');
if (!hasUserIdInOrders) {
    db.exec("ALTER TABLE orders ADD COLUMN user_id TEXT");
    console.log("🛠️ [DB Migration] orders 테이블에 user_id 컬럼 추가 완료");
}

// orders 테이블에 captured_at 컬럼이 있는지 확인 후 없으면 추가 (마이그레이션)
const hasCapturedAtInOrders = orderTableInfo.some(col => col.name === 'captured_at');
if (!hasCapturedAtInOrders) {
    db.exec("ALTER TABLE orders ADD COLUMN captured_at TEXT");
    console.log("🛠️ [DB Migration] orders 테이블에 captured_at 컬럼 추가 완료");
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
