import Database from "better-sqlite3";
import path from "path";

// .env 또는 서버 환경에서 주입된 DB_FILE 환경 변수 사용 (기본값: local.db)
const dbFileName = process.env.DB_FILE || "local.db";
const dbPath = path.resolve(__dirname, `../${dbFileName}`);
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

console.log(`📂 SQLite DB 준비 완료: ${dbPath}`);

// 테이블 생성 (초기화 시 한 번 실행됨)
// 스캐너가 잡은 콜
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

// 스캐너가 버린 데이터 (나중에 AI 분석용 모델)
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

export default db;
