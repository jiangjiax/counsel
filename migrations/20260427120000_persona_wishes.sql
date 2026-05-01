-- Persona wishlist (Michael 2026-04-27)
--
-- 案主在幕僚选人模态点「+ 许愿幕僚」→ 一行进入 persona_wishes。
-- 管理员在 /admin.html 看许愿池 → 点「✓ 已实现」→ status=fulfilled。
-- 案主下次进站，前端拉 GET /api/persona-wishes/notifications，
-- 看到 status='fulfilled' AND notified_at IS NULL 的行 → toast banner →
-- 点「我知道了」→ POST /seen → notified_at = now，从此不再 toast。
--
-- 单表方案：通知不另设表，靠 notified_at 字段去重，省一张表。

CREATE TABLE IF NOT EXISTS persona_wishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    persona_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    fulfilled_at TEXT,
    notified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_wishes_user ON persona_wishes(user_id);
CREATE INDEX IF NOT EXISTS idx_wishes_status ON persona_wishes(status);
