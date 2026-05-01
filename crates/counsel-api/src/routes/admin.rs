//! /api/admin/* — telemetry queries for the operator dashboard.
//!
//! Auth model (Michael 2026-04-25): admin status is granted by username via
//! the built-in deployment-owner list plus the `COUNSEL_ADMIN_USERNAMES` env
//! var (comma-separated). No schema change to the users table; lookup happens
//! per-request. To add more admins:
//!
//!   sudo systemctl edit counsel
//!   [Service]
//!   Environment=COUNSEL_ADMIN_USERNAMES=michael
//!
//! Then `systemctl restart counsel`. Multiple usernames are comma-separated
//! and case-insensitive. Env admins are appended; they do not replace the
//! built-in deployment-owner account below.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;

use crate::auth::AuthUser;
use crate::ApiState;

// ─── Admin gate ─────────────────────────────────────────────────────────────
//
// Admin allowlist comes from env vars only — no hardcoded operator
// identifiers in source. Set `COUNSEL_ADMIN_USERNAMES` (comma-separated)
// at deploy time. An empty allowlist means admin endpoints return 403 for
// everyone, which is the safe default for a fresh deploy.
//
// `COUNSEL_BUILTIN_ADMIN_USERNAMES` is an optional secondary list, useful
// for cases where the primary list is sourced from a config-management
// system and you want a backup admin who can't be locked out by a config
// rollback. Both lists are merged at startup.

fn admin_usernames() -> Vec<String> {
    let mut admins: Vec<String> = std::env::var("COUNSEL_ADMIN_USERNAMES")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();

    for username in std::env::var("COUNSEL_BUILTIN_ADMIN_USERNAMES")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
    {
        if !admins.contains(&username) {
            admins.push(username);
        }
    }

    admins
}

async fn lookup_username(state: &ApiState, user_id: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT username FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
}

/// Middleware: require_auth must run first; this reads AuthUser from
/// extensions, resolves the username, and checks against the admin allowlist.
pub async fn require_admin(
    State(state): State<ApiState>,
    req: axum::extract::Request,
    next: Next,
) -> Response {
    let user_id = match req.extensions().get::<AuthUser>() {
        Some(u) => u.0.clone(),
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "unauthorized" })),
            )
                .into_response()
        }
    };
    let username = match lookup_username(&state, &user_id).await {
        Some(u) => u.to_lowercase(),
        None => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "unknown user" })),
            )
                .into_response()
        }
    };
    let admins = admin_usernames();
    if admins.is_empty() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "admin disabled",
                "hint": "set COUNSEL_ADMIN_USERNAMES env var on the server"
            })),
        )
            .into_response();
    }
    if !admins.contains(&username) {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "not admin" }))).into_response();
    }
    next.run(req).await
}

// ─── Helpers ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Default)]
pub struct DaysQuery {
    /// Window in days for sliding aggregations. Defaults to 30 if absent.
    pub days: Option<i64>,
}

fn cutoff_iso(days: i64) -> String {
    let now = chrono::Utc::now();
    let cutoff = now - chrono::Duration::days(days.max(0));
    cutoff.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

// Pull a key out of the JSON `event_data` blob without parsing the whole tree.
// `json_extract` is built into SQLite — used heavily below.
const JE: &str = "json_extract(event_data, ?)";

const OPERATOR_USERNAMES: &[&str] = &["michael", "1136333527"];

fn operator_username_predicate(username_expr: &str) -> String {
    let lowered = format!("LOWER({})", username_expr);
    format!("{} IN ('michael', '1136333527')", lowered)
}

fn test_username_predicate(username_expr: &str) -> String {
    let lowered = format!("LOWER({})", username_expr);
    format!(
        "({l} GLOB 'e2e-*' OR {l} GLOB 'step3smoke*' OR {l} GLOB 'deploy-smoke*' OR {l} GLOB 'smoke_test*' OR {l} GLOB 'smoke-test*' OR {l} GLOB 'smoketest*')",
        l = lowered
    )
}

fn excluded_username_predicate(username_expr: &str) -> String {
    format!(
        "({} OR {})",
        operator_username_predicate(username_expr),
        test_username_predicate(username_expr)
    )
}

fn real_username_predicate(username_expr: &str) -> String {
    format!("NOT {}", excluded_username_predicate(username_expr))
}

fn real_user_id_predicate(user_id_expr: &str) -> String {
    format!(
        "{} NOT IN (SELECT id FROM users WHERE {})",
        user_id_expr,
        excluded_username_predicate("username")
    )
}

fn is_operator_username(username: &str) -> bool {
    let n = username.trim().to_lowercase();
    OPERATOR_USERNAMES.contains(&n.as_str())
}

fn is_test_username(username: &str) -> bool {
    let n = username.trim().to_lowercase();
    n.starts_with("e2e-")
        || n.starts_with("step3smoke")
        || n.starts_with("deploy-smoke")
        || n.starts_with("smoke_test")
        || n.starts_with("smoke-test")
        || n.starts_with("smoketest")
}

// ─── /api/admin/overview ────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct Overview {
    pub users_total: i64,
    pub users_active_window: i64,
    pub sessions_total: i64,
    pub sessions_window: i64,
    pub completed_window: i64,
    pub completion_rate_window: f64,
    pub feedback_total: i64,
    pub feedback_window: i64,
    pub events_total: i64,
    pub window_days: i64,
}

pub async fn overview(
    State(state): State<ApiState>,
    Query(q): Query<DaysQuery>,
) -> impl IntoResponse {
    let days = q.days.unwrap_or(30);
    let cutoff = cutoff_iso(days);
    let real_event_user = real_user_id_predicate("user_id");
    let real_feedback_user = real_user_id_predicate("user_id");

    let users_total = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM users WHERE {}",
        real_username_predicate("username")
    ))
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    let users_active_window = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(DISTINCT user_id) FROM events WHERE server_ts >= ? AND {}",
        real_event_user
    ))
    .bind(&cutoff)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    let sessions_total = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(DISTINCT {}) FROM events WHERE event_type = 'step_entered' AND {}",
        JE, real_event_user
    ))
    .bind("$.session_id")
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    let sessions_window = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(DISTINCT {}) FROM events WHERE event_type = 'step_entered' AND server_ts >= ? AND {}",
        JE, real_event_user
    ))
    .bind("$.session_id")
    .bind(&cutoff)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    let completed_window = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(DISTINCT {}) FROM events WHERE event_type = 'step_entered' AND {} = 8 AND server_ts >= ? AND {}",
        JE, JE, real_event_user
    ))
    .bind("$.session_id")
    .bind("$.step")
    .bind(&cutoff)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    let completion_rate_window = if sessions_window > 0 {
        completed_window as f64 / sessions_window as f64
    } else {
        0.0
    };
    let feedback_total = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM feedback WHERE {}",
        real_feedback_user
    ))
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    let feedback_window = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM feedback WHERE created_at >= ? AND {}",
        real_feedback_user
    ))
    .bind(&cutoff)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    let events_total = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM events WHERE {}",
        real_event_user
    ))
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    Json(Overview {
        users_total,
        users_active_window,
        sessions_total,
        sessions_window,
        completed_window,
        completion_rate_window,
        feedback_total,
        feedback_window,
        events_total,
        window_days: days,
    })
}

// ─── /api/admin/funnel ──────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct FunnelStep {
    pub step: i64,
    pub sessions_entered: i64,
    pub sessions_completed: i64,
    pub median_duration_ms: Option<i64>,
}

pub async fn funnel(
    State(state): State<ApiState>,
    Query(q): Query<DaysQuery>,
) -> impl IntoResponse {
    let days = q.days.unwrap_or(30);
    let cutoff = cutoff_iso(days);
    let real_event_user = real_user_id_predicate("user_id");
    let mut rows: Vec<FunnelStep> = Vec::new();
    for step in 1..=8i64 {
        let entered = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT COUNT(DISTINCT {}) FROM events WHERE event_type = 'step_entered' AND {} = ? AND server_ts >= ? AND {}",
            JE, JE, real_event_user
        ))
        .bind("$.session_id")
        .bind("$.step")
        .bind(step)
        .bind(&cutoff)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);
        let completed = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT COUNT(DISTINCT {}) FROM events WHERE event_type = 'step_completed' AND {} = ? AND server_ts >= ? AND {}",
            JE, JE, real_event_user
        ))
        .bind("$.session_id")
        .bind("$.step")
        .bind(step)
        .bind(&cutoff)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);
        // Median duration_ms — SQLite has no PERCENTILE_CONT; we materialize and grab middle.
        let durations: Vec<i64> = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT CAST({} AS INTEGER) FROM events WHERE event_type = 'step_completed' AND {} = ? AND {} IS NOT NULL AND server_ts >= ? AND {} ORDER BY 1",
            JE, JE, JE, real_event_user
        ))
        .bind("$.duration_ms")
        .bind("$.step")
        .bind(step)
        .bind("$.duration_ms")
        .bind(&cutoff)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();
        let median = if durations.is_empty() {
            None
        } else {
            Some(durations[durations.len() / 2])
        };
        rows.push(FunnelStep {
            step,
            sessions_entered: entered,
            sessions_completed: completed,
            median_duration_ms: median,
        });
    }
    Json(rows)
}

// ─── /api/admin/categories ──────────────────────────────────────────────────
// F5 (2026-04-26) — distribution of question categories from `question_categorized`
// telemetry events. No question text is stored; only the bucket label.

#[derive(Debug, Serialize)]
pub struct CategoryStat {
    pub category: String,
    pub count: i64,
}

pub async fn categories(
    State(state): State<ApiState>,
    Query(q): Query<DaysQuery>,
) -> impl IntoResponse {
    let days = q.days.unwrap_or(30);
    let cutoff = cutoff_iso(days);
    let real_event_user = real_user_id_predicate("user_id");
    let rows: Vec<(String, i64)> = sqlx::query_as(&format!(
        "SELECT COALESCE({}, '其他'), COUNT(*) \
         FROM events \
         WHERE event_type = 'question_categorized' AND server_ts >= ? AND {} \
         GROUP BY 1 ORDER BY 2 DESC",
        JE, real_event_user
    ))
    .bind("$.category")
    .bind(&cutoff)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    let out: Vec<CategoryStat> = rows
        .into_iter()
        .map(|(category, count)| CategoryStat { category, count })
        .collect();
    Json(out)
}

// ─── /api/admin/devices ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Default)]
pub struct DeviceBuckets {
    pub browsers: HashMap<String, i64>,
    pub os: HashMap<String, i64>,
    pub device_class: HashMap<String, i64>,
    pub wechat_count: i64,
    pub total: i64,
}

pub async fn devices(
    State(state): State<ApiState>,
    Query(q): Query<DaysQuery>,
) -> impl IntoResponse {
    let days = q.days.unwrap_or(30);
    let cutoff = cutoff_iso(days);
    let real_event_user = real_user_id_predicate("user_id");
    let rows: Vec<(String, String, String, Option<i64>)> = sqlx::query_as(&format!(
        "SELECT \
          COALESCE({}, 'unknown'), \
          COALESCE({}, 'unknown'), \
          COALESCE({}, 'unknown'), \
          {} \
         FROM events \
         WHERE event_type = 'session_init' AND server_ts >= ? AND {}",
        JE, JE, JE, JE, real_event_user
    ))
    .bind("$.browser")
    .bind("$.os")
    .bind("$.device_class")
    .bind("$.is_wechat")
    .bind(&cutoff)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut out = DeviceBuckets::default();
    for (browser, os, device, wechat) in &rows {
        *out.browsers.entry(browser.clone()).or_insert(0) += 1;
        *out.os.entry(os.clone()).or_insert(0) += 1;
        *out.device_class.entry(device.clone()).or_insert(0) += 1;
        if wechat.unwrap_or(0) != 0 {
            out.wechat_count += 1;
        }
    }
    out.total = rows.len() as i64;
    Json(out)
}

// ─── /api/admin/geography ───────────────────────────────────────────────────
//
// Server-side geo enrichment is intentionally skipped (no MaxMind DB on the
// box, and an outbound API call per request is wasteful). We return distinct
// IPs with counts; the dashboard does the lookup client-side via a public
// service (cached in localStorage) so the IP-to-country mapping is fresh.

#[derive(Debug, Serialize)]
pub struct IpRow {
    pub ip: String,
    pub events: i64,
    pub last_seen: String,
}

pub async fn geography(
    State(state): State<ApiState>,
    Query(q): Query<DaysQuery>,
) -> impl IntoResponse {
    let days = q.days.unwrap_or(30);
    let cutoff = cutoff_iso(days);
    let real_event_user = real_user_id_predicate("user_id");
    let rows: Vec<(Option<String>, i64, String)> = sqlx::query_as(&format!(
        "SELECT ip, COUNT(*) as c, MAX(server_ts) as last \
         FROM events \
         WHERE ip IS NOT NULL AND server_ts >= ? AND {} \
         GROUP BY ip \
         ORDER BY c DESC \
         LIMIT 100",
        real_event_user
    ))
    .bind(&cutoff)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    let out: Vec<IpRow> = rows
        .into_iter()
        .filter_map(|(ip, c, last)| {
            ip.map(|ip| IpRow {
                ip,
                events: c,
                last_seen: last,
            })
        })
        .collect();
    Json(out)
}

// ─── /api/admin/feedback ────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct FeedbackReplyRow {
    pub id: i64,
    pub feedback_id: i64,
    pub admin_user_id: String,
    pub admin_username: Option<String>,
    pub body: String,
    pub created_at: String,
    pub notified_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FeedbackRow {
    pub id: i64,
    pub user_id: String,
    pub username: Option<String>,
    pub body: String,
    pub context: Option<serde_json::Value>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: String,
    pub replies: Vec<FeedbackReplyRow>,
}

async fn feedback_replies_by_feedback_ids(
    state: &ApiState,
    feedback_ids: &[i64],
) -> HashMap<i64, Vec<FeedbackReplyRow>> {
    if feedback_ids.is_empty() {
        return HashMap::new();
    }
    let placeholders = std::iter::repeat("?")
        .take(feedback_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT id, feedback_id, admin_user_id, body, created_at, notified_at \
         FROM feedback_replies WHERE feedback_id IN ({}) ORDER BY id ASC",
        placeholders
    );
    let mut q = sqlx::query_as::<_, (i64, i64, String, String, String, Option<String>)>(&sql);
    for id in feedback_ids {
        q = q.bind(id);
    }
    let rows = q.fetch_all(&state.db).await.unwrap_or_default();

    let admin_ids: std::collections::HashSet<&str> = rows.iter().map(|r| r.2.as_str()).collect();
    let mut id_to_name: HashMap<String, String> = HashMap::new();
    for uid in admin_ids {
        if let Some(n) = lookup_username(state, uid).await {
            id_to_name.insert(uid.to_string(), n);
        }
    }

    let mut out: HashMap<i64, Vec<FeedbackReplyRow>> = HashMap::new();
    for (id, feedback_id, admin_user_id, body, created_at, notified_at) in rows {
        out.entry(feedback_id).or_default().push(FeedbackReplyRow {
            id,
            feedback_id,
            admin_username: id_to_name.get(&admin_user_id).cloned(),
            admin_user_id,
            body,
            created_at,
            notified_at,
        });
    }
    out
}

pub async fn feedback_list(State(state): State<ApiState>) -> impl IntoResponse {
    let real_feedback_user = real_user_id_predicate("f.user_id");
    let rows: Vec<(
        i64,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
    )> = sqlx::query_as(&format!(
        "SELECT f.id, f.user_id, f.body, f.context, f.ip, f.user_agent, f.created_at \
             FROM feedback f WHERE {} ORDER BY f.id DESC LIMIT 200",
        real_feedback_user
    ))
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    let feedback_ids: Vec<i64> = rows.iter().map(|r| r.0).collect();
    let mut replies_by_feedback = feedback_replies_by_feedback_ids(&state, &feedback_ids).await;

    // Resolve usernames in one pass
    let user_ids: std::collections::HashSet<&str> = rows.iter().map(|r| r.1.as_str()).collect();
    let mut id_to_name: HashMap<String, String> = HashMap::new();
    for uid in user_ids {
        if let Some(n) = lookup_username(&state, uid).await {
            id_to_name.insert(uid.to_string(), n);
        }
    }

    let out: Vec<FeedbackRow> = rows
        .into_iter()
        .map(|(id, user_id, body, context, ip, ua, created_at)| {
            let parsed_ctx = context
                .as_deref()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok());
            FeedbackRow {
                id,
                user_id: user_id.clone(),
                username: id_to_name.get(&user_id).cloned(),
                body,
                context: parsed_ctx,
                ip,
                user_agent: ua,
                created_at,
                replies: replies_by_feedback.remove(&id).unwrap_or_default(),
            }
        })
        .collect();
    Json(out)
}

const MAX_FEEDBACK_REPLY_BYTES: usize = 4096;

#[derive(Debug, Deserialize)]
pub struct FeedbackReplyIn {
    pub body: String,
}

pub async fn post_feedback_reply(
    State(state): State<ApiState>,
    AuthUser(admin_user_id): AuthUser,
    Path(feedback_id): Path<i64>,
    Json(payload): Json<FeedbackReplyIn>,
) -> impl IntoResponse {
    let body = payload.body.trim();
    if body.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "reply body is empty" })),
        )
            .into_response();
    }
    if body.len() > MAX_FEEDBACK_REPLY_BYTES {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({ "error": "reply too long (max 4KB)" })),
        )
            .into_response();
    }

    let target_user_id: Option<String> =
        sqlx::query_scalar("SELECT user_id FROM feedback WHERE id = ?")
            .bind(feedback_id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);
    let Some(target_user_id) = target_user_id else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "feedback not found" })),
        )
            .into_response();
    };

    let res = sqlx::query(
        "INSERT INTO feedback_replies (feedback_id, user_id, admin_user_id, body) VALUES (?, ?, ?, ?)",
    )
    .bind(feedback_id)
    .bind(&target_user_id)
    .bind(&admin_user_id)
    .bind(body)
    .execute(&state.db)
    .await;

    match res {
        Ok(done) => {
            let id = done.last_insert_rowid();
            let created_at: String =
                sqlx::query_scalar("SELECT created_at FROM feedback_replies WHERE id = ?")
                    .bind(id)
                    .fetch_one(&state.db)
                    .await
                    .unwrap_or_else(|_| cutoff_iso(0));
            let admin_username = lookup_username(&state, &admin_user_id).await;
            (
                StatusCode::OK,
                Json(FeedbackReplyRow {
                    id,
                    feedback_id,
                    admin_user_id,
                    admin_username,
                    body: body.to_string(),
                    created_at,
                    notified_at: None,
                }),
            )
                .into_response()
        }
        Err(e) => {
            tracing::warn!("feedback reply insert failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "save failed" })),
            )
                .into_response()
        }
    }
}

// ─── /api/admin/recent ──────────────────────────────────────────────────────
// Latest events stream — useful for sanity-checking what's flowing in.

#[derive(Debug, Serialize)]
pub struct EventRow {
    pub id: i64,
    pub user_id: String,
    pub username: Option<String>,
    pub event_type: String,
    pub event_data: serde_json::Value,
    pub server_ts: String,
}

pub async fn recent(State(state): State<ApiState>) -> impl IntoResponse {
    let real_event_user = real_user_id_predicate("user_id");
    let rows: Vec<(i64, String, String, String, String)> = sqlx::query_as(&format!(
        "SELECT id, user_id, event_type, event_data, server_ts \
         FROM events WHERE {} ORDER BY id DESC LIMIT 200",
        real_event_user
    ))
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let user_ids: std::collections::HashSet<&str> = rows.iter().map(|r| r.1.as_str()).collect();
    let mut id_to_name: HashMap<String, String> = HashMap::new();
    for uid in user_ids {
        if let Some(n) = lookup_username(&state, uid).await {
            id_to_name.insert(uid.to_string(), n);
        }
    }

    let out: Vec<EventRow> = rows
        .into_iter()
        .map(
            |(id, user_id, event_type, event_data, server_ts)| EventRow {
                id,
                username: id_to_name.get(&user_id).cloned(),
                user_id,
                event_type,
                event_data: serde_json::from_str(&event_data).unwrap_or(serde_json::Value::Null),
                server_ts,
            },
        )
        .collect();
    Json(out)
}

// ─── /api/admin/whoami — quick sanity for the dashboard ─────────────────────

pub async fn whoami(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
) -> impl IntoResponse {
    let username = lookup_username(&state, &user_id).await;
    Json(json!({
        "user_id": user_id,
        "username": username,
        "is_admin": true,  // we only get here past require_admin
    }))
}

// ─── /api/admin/users — per-user summary table ──────────────────────────────
//
// Strategy: pull each metric in a single batched GROUP BY, then merge in Rust.
// Avoids the N+1 trap of looping over users and running queries each. Defaults
// to a 30-day window for the "active in window" view; cap at 500 rows.

#[derive(Debug, Serialize)]
pub struct UserRow {
    pub user_id: String,
    pub username: String,
    pub created_at: String,
    pub last_seen: Option<String>,
    pub is_admin: bool,
    pub is_operator: bool,
    pub is_test_account: bool,
    pub events_total: i64,
    pub sessions_started: i64,
    pub sessions_completed: i64,
    pub last_step_reached: Option<i64>,
    pub total_time_ms: i64,
    pub feedback_count: i64,
    pub last_browser: Option<String>,
    pub last_os: Option<String>,
    pub is_wechat: bool,
}

async fn load_user_rows(state: &ApiState, username_where: String, limit: i64) -> Vec<UserRow> {
    let admin_set: std::collections::HashSet<String> = admin_usernames().into_iter().collect();
    let limit = limit.clamp(1, 1000);

    let users: Vec<(String, String, String)> = sqlx::query_as(&format!(
        "SELECT id, username, created_at FROM users \
         WHERE {} ORDER BY created_at DESC LIMIT {}",
        username_where, limit
    ))
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Aggregate maps keyed by user_id
    let last_seen: HashMap<String, String> = sqlx::query_as::<_, (String, String)>(
        "SELECT user_id, MAX(server_ts) FROM events GROUP BY user_id",
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .collect();

    let events_total: HashMap<String, i64> =
        sqlx::query_as::<_, (String, i64)>("SELECT user_id, COUNT(*) FROM events GROUP BY user_id")
            .fetch_all(&state.db)
            .await
            .unwrap_or_default()
            .into_iter()
            .collect();

    let sessions_started: HashMap<String, i64> = sqlx::query_as::<_, (String, i64)>(&format!(
        "SELECT user_id, COUNT(DISTINCT {}) FROM events \
         WHERE event_type='step_entered' AND {} = 1 GROUP BY user_id",
        JE, JE
    ))
    .bind("$.session_id")
    .bind("$.step")
    .fetch_all(&state.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .collect();

    let sessions_completed: HashMap<String, i64> = sqlx::query_as::<_, (String, i64)>(&format!(
        "SELECT user_id, COUNT(DISTINCT {}) FROM events \
         WHERE event_type='step_entered' AND {} = 8 GROUP BY user_id",
        JE, JE
    ))
    .bind("$.session_id")
    .bind("$.step")
    .fetch_all(&state.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .collect();

    let last_step: HashMap<String, i64> = sqlx::query_as::<_, (String, Option<i64>)>(&format!(
        "SELECT user_id, MAX(CAST({} AS INTEGER)) FROM events \
         WHERE event_type='step_entered' GROUP BY user_id",
        JE
    ))
    .bind("$.step")
    .fetch_all(&state.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .filter_map(|(u, s)| s.map(|s| (u, s)))
    .collect();

    let total_time: HashMap<String, i64> = sqlx::query_as::<_, (String, Option<i64>)>(&format!(
        "SELECT user_id, SUM(CAST({} AS INTEGER)) FROM events \
         WHERE event_type='step_completed' GROUP BY user_id",
        JE
    ))
    .bind("$.duration_ms")
    .fetch_all(&state.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .filter_map(|(u, t)| t.map(|t| (u, t)))
    .collect();

    let feedback_count: HashMap<String, i64> = sqlx::query_as::<_, (String, i64)>(
        "SELECT user_id, COUNT(*) FROM feedback GROUP BY user_id",
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .collect();

    // Latest session_init per user → last browser/os/is_wechat
    let init_rows: Vec<(String, String, Option<String>, Option<String>, Option<i64>)> =
        sqlx::query_as(&format!(
            "SELECT user_id, server_ts, {}, {}, {} FROM events \
             WHERE event_type='session_init' \
             ORDER BY server_ts DESC",
            JE, JE, JE
        ))
        .bind("$.browser")
        .bind("$.os")
        .bind("$.is_wechat")
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();
    let mut last_init: HashMap<String, (Option<String>, Option<String>, bool)> = HashMap::new();
    for (uid, _ts, br, os, wc) in init_rows {
        last_init
            .entry(uid)
            .or_insert((br, os, wc.unwrap_or(0) != 0));
    }

    let rows: Vec<UserRow> = users
        .into_iter()
        .map(|(id, username, created_at)| {
            let is_admin = admin_set.contains(&username.to_lowercase());
            let is_operator = is_operator_username(&username);
            let is_test_account = is_test_username(&username);
            let (br, os, wc) = last_init.get(&id).cloned().unwrap_or((None, None, false));
            UserRow {
                user_id: id.clone(),
                username,
                created_at,
                last_seen: last_seen.get(&id).cloned(),
                is_admin,
                is_operator,
                is_test_account,
                events_total: *events_total.get(&id).unwrap_or(&0),
                sessions_started: *sessions_started.get(&id).unwrap_or(&0),
                sessions_completed: *sessions_completed.get(&id).unwrap_or(&0),
                last_step_reached: last_step.get(&id).copied(),
                total_time_ms: *total_time.get(&id).unwrap_or(&0),
                feedback_count: *feedback_count.get(&id).unwrap_or(&0),
                last_browser: br,
                last_os: os,
                is_wechat: wc,
            }
        })
        .collect();

    // Sort by last_seen DESC (None last)
    let mut rows = rows;
    rows.sort_by(|a, b| match (&b.last_seen, &a.last_seen) {
        (Some(x), Some(y)) => x.cmp(y),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => std::cmp::Ordering::Equal,
    });

    rows
}

pub async fn users_list(
    State(state): State<ApiState>,
    Query(q): Query<DaysQuery>,
) -> impl IntoResponse {
    let _days = q.days.unwrap_or(30);
    let rows = load_user_rows(&state, real_username_predicate("username"), 500).await;
    Json(rows)
}

#[derive(Debug, Serialize, Default)]
pub struct OperatorTotals {
    pub accounts: i64,
    pub events_total: i64,
    pub sessions_started: i64,
    pub sessions_completed: i64,
    pub feedback_count: i64,
    pub total_time_ms: i64,
    pub last_seen: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OperatorSummary {
    pub accounts: Vec<UserRow>,
    pub totals: OperatorTotals,
    pub note: String,
}

pub async fn operator_summary(State(state): State<ApiState>) -> impl IntoResponse {
    let accounts = load_user_rows(&state, operator_username_predicate("username"), 50).await;
    let totals = OperatorTotals {
        accounts: accounts.len() as i64,
        events_total: accounts.iter().map(|u| u.events_total).sum(),
        sessions_started: accounts.iter().map(|u| u.sessions_started).sum(),
        sessions_completed: accounts.iter().map(|u| u.sessions_completed).sum(),
        feedback_count: accounts.iter().map(|u| u.feedback_count).sum(),
        total_time_ms: accounts.iter().map(|u| u.total_time_ms).sum(),
        last_seen: accounts.iter().filter_map(|u| u.last_seen.clone()).max(),
    };
    Json(OperatorSummary {
        accounts,
        totals,
        note: "Michael / 1136333527 单独统计，不计入运营用户数据".to_string(),
    })
}

// ─── /api/admin/users/:user_id — per-user detail page ───────────────────────

#[derive(Debug, Serialize)]
pub struct UserDetail {
    pub user: UserRow,
    pub drop_step_distribution: HashMap<i64, i64>,
    pub median_step_duration_ms: Option<i64>,
    pub unique_ips: i64,
    pub events: Vec<EventRow>,
    pub feedback: Vec<FeedbackRow>,
}

pub async fn user_detail(
    State(state): State<ApiState>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    // Reuse users_list to compute the row, then pluck the matching one.
    // Cheaper than re-computing all metrics in a different shape.
    let admin_set: std::collections::HashSet<String> = admin_usernames().into_iter().collect();

    let user_row: Option<(String, String, String)> =
        sqlx::query_as("SELECT id, username, created_at FROM users WHERE id = ?")
            .bind(&user_id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);
    let (id, username, created_at) = match user_row {
        Some(r) => r,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "user not found" })),
            )
                .into_response()
        }
    };

    let last_seen: Option<String> = sqlx::query_scalar::<_, Option<String>>(
        "SELECT MAX(server_ts) FROM events WHERE user_id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(None);
    let events_total: i64 =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM events WHERE user_id = ?")
            .bind(&id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
    let sessions_started: i64 = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(DISTINCT {}) FROM events WHERE user_id = ? AND event_type='step_entered' AND {} = 1",
        JE, JE
    ))
    .bind("$.session_id")
    .bind("$.step")
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    let sessions_completed: i64 = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(DISTINCT {}) FROM events WHERE user_id = ? AND event_type='step_entered' AND {} = 8",
        JE, JE
    ))
    .bind("$.session_id")
    .bind("$.step")
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    let last_step_reached: Option<i64> = sqlx::query_scalar::<_, Option<i64>>(&format!(
        "SELECT MAX(CAST({} AS INTEGER)) FROM events WHERE user_id = ? AND event_type='step_entered'",
        JE
    ))
    .bind("$.step")
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(None);
    let total_time_ms: i64 = sqlx::query_scalar::<_, Option<i64>>(&format!(
        "SELECT SUM(CAST({} AS INTEGER)) FROM events WHERE user_id = ? AND event_type='step_completed'",
        JE
    ))
    .bind("$.duration_ms")
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(None)
    .unwrap_or(0);
    let feedback_count: i64 =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM feedback WHERE user_id = ?")
            .bind(&id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);

    let init_row: Option<(Option<String>, Option<String>, Option<i64>)> = sqlx::query_as(&format!(
        "SELECT {}, {}, {} FROM events WHERE user_id = ? AND event_type='session_init' \
         ORDER BY server_ts DESC LIMIT 1",
        JE, JE, JE
    ))
    .bind("$.browser")
    .bind("$.os")
    .bind("$.is_wechat")
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);
    let (last_browser, last_os, is_wechat) = match init_row {
        Some((br, os, wc)) => (br, os, wc.unwrap_or(0) != 0),
        None => (None, None, false),
    };

    let user_summary = UserRow {
        user_id: id.clone(),
        username: username.clone(),
        created_at,
        last_seen,
        is_admin: admin_set.contains(&username.to_lowercase()),
        is_operator: is_operator_username(&username),
        is_test_account: is_test_username(&username),
        events_total,
        sessions_started,
        sessions_completed,
        last_step_reached,
        total_time_ms,
        feedback_count,
        last_browser,
        last_os,
        is_wechat,
    };

    // Drop-step distribution (which steps did this user abandon at)
    let drop_rows: Vec<(Option<i64>, i64)> = sqlx::query_as(&format!(
        "SELECT CAST({} AS INTEGER), COUNT(*) FROM events \
         WHERE user_id = ? AND event_type='step_dropped' GROUP BY CAST({} AS INTEGER)",
        JE, JE
    ))
    .bind("$.step")
    .bind("$.step")
    .bind(&id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    let drop_step_distribution: HashMap<i64, i64> = drop_rows
        .into_iter()
        .filter_map(|(s, c)| s.map(|s| (s, c)))
        .collect();

    // Median step duration across all step_completed events for this user
    let durations: Vec<i64> = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT CAST({} AS INTEGER) FROM events \
         WHERE user_id = ? AND event_type='step_completed' AND {} IS NOT NULL ORDER BY 1",
        JE, JE
    ))
    .bind("$.duration_ms")
    .bind("$.duration_ms")
    .bind(&id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    let median_step_duration_ms = if durations.is_empty() {
        None
    } else {
        Some(durations[durations.len() / 2])
    };

    let unique_ips: i64 = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(DISTINCT ip) FROM events WHERE user_id = ? AND ip IS NOT NULL",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    // Latest 200 events
    let event_rows: Vec<(i64, String, String, String, String)> = sqlx::query_as(
        "SELECT id, user_id, event_type, event_data, server_ts FROM events \
         WHERE user_id = ? ORDER BY id DESC LIMIT 200",
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    let events: Vec<EventRow> = event_rows
        .into_iter()
        .map(|(eid, uid, et, ed, ts)| EventRow {
            id: eid,
            user_id: uid,
            username: Some(username.clone()),
            event_type: et,
            event_data: serde_json::from_str(&ed).unwrap_or(serde_json::Value::Null),
            server_ts: ts,
        })
        .collect();

    // All feedback by this user
    let fb_rows: Vec<(
        i64,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
    )> = sqlx::query_as(
        "SELECT id, user_id, body, context, ip, user_agent, created_at FROM feedback \
         WHERE user_id = ? ORDER BY id DESC LIMIT 100",
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    let feedback_ids: Vec<i64> = fb_rows.iter().map(|r| r.0).collect();
    let mut replies_by_feedback = feedback_replies_by_feedback_ids(&state, &feedback_ids).await;
    let feedback: Vec<FeedbackRow> = fb_rows
        .into_iter()
        .map(|(fid, _uid, body, ctx, ip, ua, ts)| FeedbackRow {
            id: fid,
            user_id: id.clone(),
            username: Some(username.clone()),
            body,
            context: ctx
                .as_deref()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok()),
            ip,
            user_agent: ua,
            created_at: ts,
            replies: replies_by_feedback.remove(&fid).unwrap_or_default(),
        })
        .collect();

    Json(UserDetail {
        user: user_summary,
        drop_step_distribution,
        median_step_duration_ms,
        unique_ips,
        events,
        feedback,
    })
    .into_response()
}

// ═══════════════════════════════════════════════════════════════════════════
// Chat-mode admin dashboards (§3.9 双轨入口)
//
// All metrics are derived from the `events` table — same schema as the 8-step
// flow. Source events: chat_room_created / chat_message_sent /
// chat_persona_replied / chat_topic_categorized / chat_room_resumed /
// chat_session_heartbeat. Privacy: routes/chat.rs whitelist guarantees no
// content has ever entered these rows. We aggregate by user_id, persona_slug,
// and category — never by content fields.
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct ChatOverview {
    pub rooms_created: i64,
    pub rooms_active: i64, // distinct room_ids with ≥1 chat_message_sent
    pub messages_total: i64,
    pub users_active: i64,
    pub persona_replies_total: i64,
    pub window_days: i64,
}

pub async fn chat_overview(
    State(state): State<ApiState>,
    Query(q): Query<DaysQuery>,
) -> impl IntoResponse {
    let days = q.days.unwrap_or(30);
    let cutoff = cutoff_iso(days);
    let real_event_user = real_user_id_predicate("user_id");

    let rooms_created = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM events WHERE event_type='chat_room_created' AND server_ts >= ? AND {}",
        real_event_user
    ))
    .bind(&cutoff)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let rooms_active = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(DISTINCT {}) FROM events WHERE event_type='chat_message_sent' AND server_ts >= ? AND {}",
        JE, real_event_user
    ))
    .bind("$.room_id")
    .bind(&cutoff)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let messages_total = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM events WHERE event_type='chat_message_sent' AND server_ts >= ? AND {}",
        real_event_user
    ))
    .bind(&cutoff)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let users_active = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(DISTINCT user_id) FROM events WHERE event_type LIKE 'chat_%' AND server_ts >= ? AND {}",
        real_event_user
    ))
    .bind(&cutoff)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let persona_replies_total = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM events WHERE event_type='chat_persona_replied' AND server_ts >= ? AND {}",
        real_event_user
    ))
    .bind(&cutoff)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    Json(ChatOverview {
        rooms_created,
        rooms_active,
        messages_total,
        users_active,
        persona_replies_total,
        window_days: days,
    })
}

// ─── /api/admin/chat/topics — topic-category distribution ──────────────────

pub async fn chat_topics(
    State(state): State<ApiState>,
    Query(q): Query<DaysQuery>,
) -> impl IntoResponse {
    let days = q.days.unwrap_or(30);
    let cutoff = cutoff_iso(days);
    let real_event_user = real_user_id_predicate("user_id");
    let rows: Vec<(String, i64)> = sqlx::query_as(&format!(
        "SELECT COALESCE({}, '其他'), COUNT(*) FROM events \
         WHERE event_type='chat_topic_categorized' AND server_ts >= ? AND {} \
         GROUP BY 1 ORDER BY 2 DESC",
        JE, real_event_user
    ))
    .bind("$.category")
    .bind(&cutoff)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    let out: Vec<CategoryStat> = rows
        .into_iter()
        .map(|(category, count)| CategoryStat { category, count })
        .collect();
    Json(out)
}

// ─── /api/admin/chat/personas — combo matrix + per-persona usage ───────────

#[derive(Debug, Serialize)]
pub struct PersonaUsage {
    pub persona_slug: String,
    /// How many rooms had this persona at creation time.
    pub rooms_with: i64,
    /// How many replies this persona has streamed across all rooms.
    pub replies: i64,
}

pub async fn chat_personas(
    State(state): State<ApiState>,
    Query(q): Query<DaysQuery>,
) -> impl IntoResponse {
    let days = q.days.unwrap_or(30);
    let cutoff = cutoff_iso(days);
    let real_event_user = real_user_id_predicate("user_id");

    // Replies — direct GROUP BY on persona_slug field.
    let reply_rows: Vec<(String, i64)> = sqlx::query_as(&format!(
        "SELECT COALESCE({}, '?'), COUNT(*) FROM events \
         WHERE event_type='chat_persona_replied' AND server_ts >= ? AND {} \
         GROUP BY 1",
        JE, real_event_user
    ))
    .bind("$.persona_slug")
    .bind(&cutoff)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    let mut replies_by_slug: HashMap<String, i64> = reply_rows.into_iter().collect();

    // Rooms-with — chat_room_created carries persona_slugs[]; use json_each
    // to unnest. SQLite's json_each is variadic; we reach for it via raw SQL.
    let room_rows: Vec<(String, i64)> = sqlx::query_as(&format!(
        "SELECT je.value, COUNT(DISTINCT events.id) FROM events, \
         json_each(json_extract(events.event_data, '$.persona_slugs')) as je \
         WHERE events.event_type='chat_room_created' AND events.server_ts >= ? AND {} \
         GROUP BY je.value",
        real_user_id_predicate("events.user_id")
    ))
    .bind(&cutoff)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    let mut rooms_by_slug: HashMap<String, i64> = room_rows.into_iter().collect();

    // Union the keys
    let mut all_slugs: std::collections::HashSet<String> = std::collections::HashSet::new();
    all_slugs.extend(replies_by_slug.keys().cloned());
    all_slugs.extend(rooms_by_slug.keys().cloned());
    let mut out: Vec<PersonaUsage> = all_slugs
        .into_iter()
        .map(|slug| PersonaUsage {
            rooms_with: rooms_by_slug.remove(&slug).unwrap_or(0),
            replies: replies_by_slug.remove(&slug).unwrap_or(0),
            persona_slug: slug,
        })
        .collect();
    out.sort_by(|a, b| b.rooms_with.cmp(&a.rooms_with));
    Json(out)
}

// ─── /api/admin/chat/retention — D1/D3/D7 ──────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ChatRetention {
    pub cohort_days: i64,
    pub rooms_created: i64,
    pub returned_d1: i64,
    pub returned_d3: i64,
    pub returned_d7: i64,
}

pub async fn chat_retention(
    State(state): State<ApiState>,
    Query(q): Query<DaysQuery>,
) -> impl IntoResponse {
    let days = q.days.unwrap_or(30);
    let cutoff = cutoff_iso(days);
    let real_event_user = real_user_id_predicate("user_id");

    // For each chat_room_created event in the cohort window, check whether
    // the same room has any chat_message_sent within {1, 3, 7} days AFTER
    // the create timestamp. SQLite julianday() lets us compute day deltas.
    //
    // We materialize the cohort then probe — N+1 is fine here: the cohort
    // is per-window (≤30 days), bounded, and admin-only.
    let cohort: Vec<(String, String)> = sqlx::query_as(&format!(
        "SELECT {}, server_ts FROM events \
         WHERE event_type='chat_room_created' AND server_ts >= ? AND {}",
        JE, real_event_user
    ))
    .bind("$.room_id")
    .bind(&cutoff)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut returned_d1 = 0i64;
    let mut returned_d3 = 0i64;
    let mut returned_d7 = 0i64;
    for (room_id, created_ts) in &cohort {
        let returned_within: Vec<f64> = sqlx::query_scalar::<_, f64>(&format!(
            "SELECT julianday(server_ts) - julianday(?) FROM events \
             WHERE event_type='chat_message_sent' AND {} = ? AND server_ts > ? \
             ORDER BY server_ts ASC LIMIT 1",
            JE
        ))
        .bind(created_ts)
        .bind("$.room_id")
        .bind(room_id)
        .bind(created_ts)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();
        if let Some(&delta) = returned_within.first() {
            if delta <= 1.0 {
                returned_d1 += 1;
            }
            if delta <= 3.0 {
                returned_d3 += 1;
            }
            if delta <= 7.0 {
                returned_d7 += 1;
            }
        }
    }

    Json(ChatRetention {
        cohort_days: days,
        rooms_created: cohort.len() as i64,
        returned_d1,
        returned_d3,
        returned_d7,
    })
}

// ─── /api/admin/chat/flow — flow continuity (心流) distribution ────────────
//
// A "flow" is a streak of chat_message_sent events from the same user where
// every consecutive gap is < 5 minutes. Total flow time = (last_ts - first_ts)
// of the streak. We compute median + p95 across all flows in the window.

#[derive(Debug, Serialize)]
pub struct ChatFlow {
    pub flows_total: i64,
    pub median_flow_seconds: i64,
    pub p95_flow_seconds: i64,
    pub avg_messages_per_flow: f64,
}

pub async fn chat_flow(
    State(state): State<ApiState>,
    Query(q): Query<DaysQuery>,
) -> impl IntoResponse {
    let days = q.days.unwrap_or(30);
    let cutoff = cutoff_iso(days);
    let real_event_user = real_user_id_predicate("user_id");

    // Per (user_id, room_id) timeline. Sort by ts and break into flows
    // wherever gap > 5min (300_000 ms in julianday: 300/86400 ≈ 0.003472).
    let rows: Vec<(String, String, String)> = sqlx::query_as(&format!(
        "SELECT user_id, COALESCE({}, ''), server_ts FROM events \
         WHERE event_type='chat_message_sent' AND server_ts >= ? AND {} \
         ORDER BY user_id, {}, server_ts",
        JE, real_event_user, JE
    ))
    .bind("$.room_id")
    .bind(&cutoff)
    .bind("$.room_id")
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut flows: Vec<(i64, i64)> = Vec::new(); // (duration_seconds, message_count)
    let mut cur_user_room = String::new();
    let mut cur_start: Option<chrono::DateTime<chrono::Utc>> = None;
    let mut cur_last: Option<chrono::DateTime<chrono::Utc>> = None;
    let mut cur_count: i64 = 0;
    let gap_threshold = chrono::Duration::minutes(5);

    let parse_ts = |s: &str| -> Option<chrono::DateTime<chrono::Utc>> {
        chrono::DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|d| d.with_timezone(&chrono::Utc))
    };

    let close_flow = |flows: &mut Vec<(i64, i64)>,
                      start: Option<chrono::DateTime<chrono::Utc>>,
                      last: Option<chrono::DateTime<chrono::Utc>>,
                      count: i64| {
        if let (Some(s), Some(l)) = (start, last) {
            if count > 0 {
                let dur = (l - s).num_seconds().max(0);
                flows.push((dur, count));
            }
        }
    };

    for (uid, room_id, ts_str) in rows {
        let key = format!("{}|{}", uid, room_id);
        let ts = match parse_ts(&ts_str) {
            Some(t) => t,
            None => continue,
        };
        if key != cur_user_room {
            close_flow(&mut flows, cur_start, cur_last, cur_count);
            cur_user_room = key;
            cur_start = Some(ts);
            cur_last = Some(ts);
            cur_count = 1;
            continue;
        }
        let prev = cur_last.unwrap_or(ts);
        if ts.signed_duration_since(prev) > gap_threshold {
            // Gap too long — close current flow and start a new one in the same room.
            close_flow(&mut flows, cur_start, cur_last, cur_count);
            cur_start = Some(ts);
            cur_last = Some(ts);
            cur_count = 1;
        } else {
            cur_last = Some(ts);
            cur_count += 1;
        }
    }
    close_flow(&mut flows, cur_start, cur_last, cur_count);

    let mut durations: Vec<i64> = flows.iter().map(|(d, _)| *d).collect();
    durations.sort_unstable();
    let median = if durations.is_empty() {
        0
    } else {
        durations[durations.len() / 2]
    };
    let p95 = if durations.is_empty() {
        0
    } else {
        let idx = (durations.len() as f64 * 0.95).floor() as usize;
        durations[idx.min(durations.len() - 1)]
    };
    let avg_msgs = if flows.is_empty() {
        0.0
    } else {
        flows.iter().map(|(_, c)| *c as f64).sum::<f64>() / flows.len() as f64
    };

    Json(ChatFlow {
        flows_total: flows.len() as i64,
        median_flow_seconds: median,
        p95_flow_seconds: p95,
        avg_messages_per_flow: avg_msgs,
    })
}

// ─── /api/admin/incidents ───────────────────────────────────────────────────
// Reads JSONL files written by `crate::incidents::record_incident`. Returns a
// flat list (newest-first) plus a precomputed group-by-kind summary so the
// frontend can render headline counts without re-walking the array.

#[derive(Debug, Deserialize, Default)]
pub struct IncidentsQuery {
    pub days: Option<u32>,
    pub kind: Option<String>,
    pub step: Option<u8>,
}

#[derive(Debug, Serialize)]
pub struct IncidentsSummary {
    pub by_kind: HashMap<String, u64>,
    pub by_step: HashMap<String, u64>,
    pub total: u64,
}

#[derive(Debug, Serialize)]
pub struct IncidentsResponse {
    pub records: Vec<crate::incidents::IncidentRecord>,
    pub summary: IncidentsSummary,
}

pub async fn incidents_list(
    Query(q): Query<IncidentsQuery>,
) -> impl IntoResponse {
    let filters = crate::incidents::ListFilters {
        days: q.days,
        kind: q.kind,
        step: q.step,
    };
    let records = match crate::incidents::list_incidents(filters).await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("read incidents: {e}") })),
            )
                .into_response();
        }
    };
    let mut by_kind: HashMap<String, u64> = HashMap::new();
    let mut by_step: HashMap<String, u64> = HashMap::new();
    for r in &records {
        *by_kind.entry(r.kind.clone()).or_insert(0) += 1;
        *by_step.entry(r.step.to_string()).or_insert(0) += 1;
    }
    let total = records.len() as u64;
    Json(IncidentsResponse {
        records,
        summary: IncidentsSummary { by_kind, by_step, total },
    })
    .into_response()
}
