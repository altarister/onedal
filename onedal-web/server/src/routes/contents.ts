import { Router } from "express";
import { CONTENT_KINDS, isoKst, type ContentKind, type ContentReply } from "@onedal/shared";
import db from "../db";

/**
 * 📝 **글 읽기 — 약관 · 안내** (reviews/29 2단계 · shared join.ts `ContentReply`).
 * 🔴 로그인 없이 읽는다 — 약관은 가입 전에 읽는다. 쓰기는 운영센터(/api/ops/contents · 3단계)만.
 * 글은 판마다 한 줄(contents 표) — 여기는 종류별 최신 판 하나. 없으면 null(화면이 «글 자리»를 보인다 · 글이 비어도 흐름이 돈다).
 */
const router = Router();

/** 종류별 최신 판 — 없으면 null. 가입 문(동의 판 대조 · 다시 동의)도 같은 함수를 읽는다 */
export function latestContent(kind: ContentKind): ContentReply | null {
    const row = db.prepare(`SELECT kind, version, title, body, updated_at FROM contents WHERE kind = ? ORDER BY version DESC LIMIT 1`).get(kind) as
        { kind: ContentKind; version: number; title: string; body: string; updated_at: string } | undefined;
    return row ? { kind: row.kind, version: row.version, title: row.title, body: row.body, updatedAt: isoKst(row.updated_at) ?? '' } : null;
}

export const isContentKind = (v: unknown): v is ContentKind => CONTENT_KINDS.includes(v as ContentKind);

router.get("/:kind", (req, res) => {
    const kind = req.params.kind;
    if (!isContentKind(kind)) return res.status(404).json({ error: "없는 글 종류입니다." });
    return res.json(latestContent(kind));
});

export default router;
