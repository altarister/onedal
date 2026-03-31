import Database from "better-sqlite3";
import path from "path";

// DB 파일 경로 설정 (server 폴더 바로 아래)
const dbPath = path.resolve(__dirname, "../data.db");
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
