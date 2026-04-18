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

// ═══════════════════════════════════════
// [4] 차량 및 라우팅 설정
// ═══════════════════════════════════════
db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        car_type INTEGER DEFAULT 1,
        car_fuel TEXT DEFAULT 'GASOLINE',
        car_hipass BOOLEAN DEFAULT 1,
        fuel_price INTEGER DEFAULT 1600,
        fuel_efficiency REAL DEFAULT 10.0,
        default_priority TEXT DEFAULT 'RECOMMEND' CHECK(default_priority IN ('RECOMMEND', 'TIME', 'DISTANCE')),
        avoid_toll BOOLEAN DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);

// ═══════════════════════════════════════
// [5] 콜 사냥용 필터 정보
// ═══════════════════════════════════════
db.exec(`
    CREATE TABLE IF NOT EXISTS user_filters (
        user_id TEXT PRIMARY KEY,
        destination_city TEXT DEFAULT '',
        destination_radius_km INTEGER DEFAULT 10,
        corridor_radius_km INTEGER DEFAULT 1,
        allowed_vehicle_types TEXT DEFAULT '["다마스","라보","오토바이"]',
        min_fare INTEGER DEFAULT 0,
        max_fare INTEGER DEFAULT 1000000,
        pickup_radius_km REAL DEFAULT 999,
        excluded_keywords TEXT DEFAULT '[]',
        destination_keywords TEXT DEFAULT '[]',
        is_active BOOLEAN DEFAULT 0,
        is_shared_mode BOOLEAN DEFAULT 0,
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
        timestamp TEXT NOT NULL
    )
`);

// ═══════════════════════════════════════
// [8] intel 테이블 마이그레이션 (소유권 부여)
// ═══════════════════════════════════════
try {
    const tableInfo = db.prepare("PRAGMA table_info(intel)").all() as any[];
    const hasUserId = tableInfo.some(col => col.name === 'user_id');
    if (!hasUserId) {
        db.exec(`
            ALTER TABLE intel ADD COLUMN user_id TEXT REFERENCES users(id);
            ALTER TABLE intel ADD COLUMN device_id TEXT;
        `);
        console.log("🛠️ intel 테이블 마이그레이션 완료 (user_id 컬럼 추가)");
    }
} catch (e) {
    console.error("intel 테이블 마이그레이션 오류:", e);
}

// ═══════════════════════════════════════
// [9] user_settings 변경 마이그레이션 (car_type -> vehicle_type)
// ═══════════════════════════════════════
try {
    const tableInfo = db.prepare("PRAGMA table_info(user_settings)").all() as any[];
    const hasVehicleType = tableInfo.some(col => col.name === 'vehicle_type');
    if (!hasVehicleType) {
        db.exec(`
            ALTER TABLE user_settings ADD COLUMN vehicle_type TEXT DEFAULT '1t';
        `);
        console.log("🛠️ user_settings 테이블 마이그레이션 완료 (vehicle_type 컬럼 추가)");
    }
} catch (e) {
    console.error("user_settings 테이블 마이그레이션 오류:", e);
}

export default db;
