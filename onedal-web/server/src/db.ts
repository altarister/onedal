import Database from "better-sqlite3";
import path from "path";

// DB 파일 경로 설정 (server 폴더 바로 아래)
const dbPath = path.resolve(__dirname, "../../data.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

console.log(`📂 SQLite DB 준비 완료: ${dbPath}`);

// 테이블 초기화
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    texts TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    status TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS intel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    texts TEXT NOT NULL,
    timestamp TEXT NOT NULL
  )
`);

export default db;
