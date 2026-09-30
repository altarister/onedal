/**
 * 🧪 **일꾼마다 빈 검사 DB** — 서버 db.ts 가 읽는 DB_FILE(server/ 기준 파일 이름)을 모듈을 불러오기 전에 정한다.
 * 빈 파일로 시작하면 db.ts 가 열 때 표를 만든다. 기사님 로컬 서버(4000)의 local.db 와 절대 같은 파일을 쓰지 않는다
 * (tests/rules/jestDbIsolated.test.ts 가 문다). 한 일꾼 안의 검사 파일들은 차례로 돌아 한 파일을 나눠 쓴다.
 */
process.env.DB_FILE = `jest-w${process.env.JEST_WORKER_ID || '1'}.db`;
