-- Feedback replies (Michael 2026-04-28)
--
-- 管理员在 /admin.html 对某条反馈直接回复。回复按 feedback_id 归档，
-- 同时冗余 target user_id，方便用户端拉取未读回复并在看到后标记 notified_at。

CREATE TABLE IF NOT EXISTS feedback_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    admin_user_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    notified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_replies_feedback ON feedback_replies(feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_replies_user_unread ON feedback_replies(user_id, notified_at);
