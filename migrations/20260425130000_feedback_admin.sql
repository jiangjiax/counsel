-- Phase H · Feedback + admin telemetry enrichment (Michael 2026-04-25)
--
-- Adds:
-- 1. `feedback` table — receives the floating-button submissions; one row per
--    user click. Captures lightweight context (current step / session) so the
--    admin can correlate "user X complained while on step 6" without scanning
--    chat content (which we never store server-side).
-- 2. `events.ip` + `events.user_agent` columns — populated on /api/events
--    ingestion from request headers. Used by the admin dashboard to derive
--    device class, browser, and rough geography. Both are nullable; older
--    rows pre-migration stay NULL.

ALTER TABLE events ADD COLUMN ip TEXT;
ALTER TABLE events ADD COLUMN user_agent TEXT;

CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    body TEXT NOT NULL,
    context TEXT,                 -- JSON: {step, session_id, project_id, url}
    ip TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_ts ON feedback(created_at);
