import db from '../../src/db';

/**
 * 🪪 **검사용 승인된 회원 한 줄** — 폰 문은 회원 줄이 없거나 승인 전이면 막는다(core/accountGate).
 *    폰을 잇는 검사는 user_devices 앞에 이것을 부른다. 이미 있으면 승인 시각만 채운다.
 */
export function approvedUser(id: string): void {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, id);
    db.prepare(`UPDATE users SET approved_at = COALESCE(approved_at, datetime('now', 'localtime')) WHERE id = ?`).run(id);
}
