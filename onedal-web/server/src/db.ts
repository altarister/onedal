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
        destination_radius_km INTEGER DEFAULT 0,
        corridor_radius_km INTEGER DEFAULT 0,
        allowed_vehicle_types TEXT DEFAULT '[]',
        min_fare INTEGER DEFAULT 0,
        max_fare INTEGER DEFAULT 0,
        pickup_radius_km REAL DEFAULT 0,
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

// ═══════════════════════════════════════
// [10] user_devices 마이그레이션 (device_id 글로벌 유니크 제약)
// 하나의 물리 기기(UUID)는 오직 한 명의 기사 계정에만 귀속되도록 강제
// ═══════════════════════════════════════
try {
    // 기존 인덱스가 없을 때만 생성 (CREATE IF NOT EXISTS 미지원이므로 try/catch로 안전 처리)
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_device_id_unique ON user_devices(device_id)`);
} catch (e) {
    // 이미 존재하면 무시 (정상)
}

// ═══════════════════════════════════════
// [11] user_filters 마이그레이션 (load_state 적재 상태 추가)
// ═══════════════════════════════════════
try {
    const tableInfo = db.prepare("PRAGMA table_info(user_filters)").all() as any[];
    const hasLoadState = tableInfo.some(col => col.name === 'load_state');
    if (!hasLoadState) {
        db.exec(`ALTER TABLE user_filters ADD COLUMN load_state TEXT DEFAULT 'EMPTY';`);
        console.log("🛠️ user_filters 테이블 마이그레이션 완료 (load_state 컬럼 추가)");
    }
} catch (e) {
    console.error("user_filters load_state 마이그레이션 오류:", e);
}

// ═══════════════════════════════════════
// [12] user_settings 마이그레이션 (귀가콜용 집 주소)
// ═══════════════════════════════════════
try {
    const tableInfo = db.prepare("PRAGMA table_info(user_settings)").all() as any[];
    const hasHomeAddress = tableInfo.some(col => col.name === 'home_address');
    if (!hasHomeAddress) {
        db.exec(`
            ALTER TABLE user_settings ADD COLUMN home_address TEXT DEFAULT '';
            ALTER TABLE user_settings ADD COLUMN home_x REAL DEFAULT 0;
            ALTER TABLE user_settings ADD COLUMN home_y REAL DEFAULT 0;
        `);
        console.log("🛠️ user_settings 테이블 마이그레이션 완료 (home_address, home_x, home_y 컬럼 추가)");
    }
} catch (e) {
    console.error("user_settings home_address 마이그레이션 오류:", e);
}

// ═══════════════════════════════════════
// [13] user_filters 마이그레이션 (다이내믹 요율 계산 엔진 파라미터)
// ═══════════════════════════════════════
try {
    const tableInfo = db.prepare("PRAGMA table_info(user_filters)").all() as any[];
    const hasVehicleRates = tableInfo.some(col => col.name === 'vehicle_rates');
    if (!hasVehicleRates) {
        const defaultRates = JSON.stringify({
            "오토바이": 700, "다마스": 800, "라보": 900, "승용차": 900,
            "1t": 1000, "1.4t": 1100, "2.5t": 1200, "3.5t": 1300,
            "5t": 1500, "11t": 2000, "25t": 2500, "특수화물": 3000
        });
        db.exec(`
            ALTER TABLE user_filters ADD COLUMN vehicle_rates TEXT DEFAULT '${defaultRates}';
            ALTER TABLE user_filters ADD COLUMN agency_fee_percent REAL DEFAULT 23.0;
            ALTER TABLE user_filters ADD COLUMN max_discount_percent REAL DEFAULT 10.0;
        `);
        console.log("🛠️ user_filters 테이블 마이그레이션 완료 (vehicle_rates, agency_fee_percent, max_discount_percent 컬럼 추가)");
    }
} catch (e) {
    console.error("user_filters 요율 마이그레이션 오류:", e);
}

// ═══════════════════════════════════════
// [14] user_settings 마이그레이션 (알림 볼륨)
// ═══════════════════════════════════════
try {
    const tableInfo = db.prepare("PRAGMA table_info(user_settings)").all() as any[];
    const hasAlarmVolume = tableInfo.some(col => col.name === 'alarm_volume');
    if (!hasAlarmVolume) {
        db.exec(`ALTER TABLE user_settings ADD COLUMN alarm_volume INTEGER DEFAULT 50;`);
        console.log("🛠️ user_settings 테이블 마이그레이션 완료 (alarm_volume 컬럼 추가)");
    }
} catch (e) {
    console.error("user_settings alarm_volume 마이그레이션 오류:", e);
}

export default db;
