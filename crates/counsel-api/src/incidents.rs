//! Incident black-box: append-only structured log of step failures /
//! stuck timeouts / empty model responses. Read by /api/admin/incidents.
//!
//! One JSONL file per day under `./incidents/YYYY-MM-DD.jsonl`. Files older
//! than `RETENTION_DAYS` are deleted lazily when a new day rolls over. A
//! single file is rotated to `.1` (and `.1` further to `.2`, max 3) when it
//! exceeds `MAX_FILE_BYTES` so the working file stays inspectable.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

const RETENTION_DAYS: i64 = 7;
const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;
const ROTATE_KEEP: usize = 3;

/// Where incidents are stored. Defaults to `./incidents` next to the binary's
/// CWD; overridable via env for tests.
pub fn incidents_dir() -> PathBuf {
    std::env::var("COUNSEL_INCIDENTS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./incidents"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncidentRecord {
    /// RFC3339 timestamp.
    pub ts: String,
    pub project_id: String,
    pub session_id: String,
    pub step: u8,
    /// One of: `empty_response`, `stuck_timeout`, `core_error`, `stream_error`.
    pub kind: String,
    /// Short human-readable reason — first line of the underlying error or
    /// a constant phrase like "facilitator returned 0 chars".
    pub reason: String,
    pub duration_ms: u64,
    /// `provider:model_name` if known.
    pub model: String,
    /// Per-input character counts. Keys are stable strings like
    /// `raw_input` / `user_wiki` / `last_session` / `prior_beliefs` /
    /// `execution_journal`. Empty when not applicable.
    #[serde(default)]
    pub ctx_sizes: BTreeMap<String, usize>,
}

impl IncidentRecord {
    pub fn new(
        project_id: impl Into<String>,
        session_id: impl Into<String>,
        step: u8,
        kind: impl Into<String>,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            ts: chrono::Utc::now().to_rfc3339(),
            project_id: project_id.into(),
            session_id: session_id.into(),
            step,
            kind: kind.into(),
            reason: reason.into(),
            duration_ms: 0,
            model: String::new(),
            ctx_sizes: BTreeMap::new(),
        }
    }

    pub fn with_duration(mut self, ms: u64) -> Self {
        self.duration_ms = ms;
        self
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = model.into();
        self
    }

    pub fn with_ctx_sizes(mut self, sizes: BTreeMap<String, usize>) -> Self {
        self.ctx_sizes = sizes;
        self
    }
}

fn today_path(dir: &Path) -> PathBuf {
    dir.join(format!("{}.jsonl", chrono::Utc::now().format("%Y-%m-%d")))
}

/// Append a single incident to today's JSONL file. Best-effort — failures
/// are logged via `tracing::warn!` but never propagated, since incident
/// recording must never disrupt the user-facing flow.
pub async fn record_incident(record: IncidentRecord) {
    if let Err(e) = record_incident_inner(record).await {
        tracing::warn!("incident write failed (non-fatal): {e}");
    }
}

async fn record_incident_inner(record: IncidentRecord) -> std::io::Result<()> {
    let dir = incidents_dir();
    tokio::fs::create_dir_all(&dir).await?;

    let path = today_path(&dir);
    rotate_if_needed(&path).await.ok();

    let mut line = serde_json::to_string(&record)
        .unwrap_or_else(|_| String::from("{\"kind\":\"serialize_error\"}"));
    line.push('\n');

    let mut f = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await?;
    f.write_all(line.as_bytes()).await?;
    f.flush().await?;

    purge_old(&dir).await.ok();
    Ok(())
}

async fn rotate_if_needed(path: &Path) -> std::io::Result<()> {
    let meta = match tokio::fs::metadata(path).await {
        Ok(m) => m,
        Err(_) => return Ok(()),
    };
    if meta.len() < MAX_FILE_BYTES {
        return Ok(());
    }
    // Shift .{n} → .{n+1} until ROTATE_KEEP, drop the rest.
    for i in (1..ROTATE_KEEP).rev() {
        let from = path.with_extension(format!("jsonl.{i}"));
        let to = path.with_extension(format!("jsonl.{}", i + 1));
        let _ = tokio::fs::rename(&from, &to).await;
    }
    let first = path.with_extension("jsonl.1");
    tokio::fs::rename(path, &first).await?;
    Ok(())
}

async fn purge_old(dir: &Path) -> std::io::Result<()> {
    let mut entries = tokio::fs::read_dir(dir).await?;
    let cutoff = chrono::Utc::now() - chrono::Duration::days(RETENTION_DAYS);
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name();
        let s = name.to_string_lossy();
        // Match `YYYY-MM-DD.jsonl` (skip rotated `.jsonl.N` — they're recent
        // by construction, the rotation happened today).
        let stem = s.strip_suffix(".jsonl").unwrap_or("");
        if stem.len() != 10 {
            continue;
        }
        if let Ok(d) = chrono::NaiveDate::parse_from_str(stem, "%Y-%m-%d") {
            let dt = d.and_hms_opt(0, 0, 0).unwrap().and_utc();
            if dt < cutoff {
                let _ = tokio::fs::remove_file(entry.path()).await;
            }
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ListFilters {
    /// Days to look back. Defaults to 7. Max 30.
    pub days: Option<u32>,
    /// Filter by kind (exact match).
    pub kind: Option<String>,
    /// Filter by step (exact match).
    pub step: Option<u8>,
}

/// Read incidents from disk, newest-first, filtered.
pub async fn list_incidents(filters: ListFilters) -> std::io::Result<Vec<IncidentRecord>> {
    let dir = incidents_dir();
    let days = filters.days.unwrap_or(7).min(30) as i64;
    let cutoff = chrono::Utc::now() - chrono::Duration::days(days);

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = tokio::fs::read_dir(&dir).await?;
    let mut paths: Vec<PathBuf> = Vec::new();
    while let Some(e) = entries.next_entry().await? {
        let p = e.path();
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        // Take both today's file and any rotated `.jsonl.N` siblings within
        // the date window.
        if !(name.ends_with(".jsonl") || name.contains(".jsonl.")) {
            continue;
        }
        // Match the YYYY-MM-DD prefix.
        if name.len() < 10 {
            continue;
        }
        let stem = &name[..10];
        if let Ok(d) = chrono::NaiveDate::parse_from_str(stem, "%Y-%m-%d") {
            let dt = d.and_hms_opt(0, 0, 0).unwrap().and_utc();
            if dt >= cutoff {
                paths.push(p);
            }
        }
    }

    let mut out: Vec<IncidentRecord> = Vec::new();
    for p in paths {
        let content = match tokio::fs::read_to_string(&p).await {
            Ok(c) => c,
            Err(_) => continue,
        };
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<IncidentRecord>(line) {
                Ok(r) => {
                    if let Some(ref k) = filters.kind {
                        if &r.kind != k { continue; }
                    }
                    if let Some(s) = filters.step {
                        if r.step != s { continue; }
                    }
                    out.push(r);
                }
                Err(e) => {
                    tracing::debug!("incident jsonl parse skip: {}", e);
                }
            }
        }
    }
    out.sort_by(|a, b| b.ts.cmp(&a.ts));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Tests share the COUNSEL_INCIDENTS_DIR env var so they must serialize.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    struct IsolatedDir<'a> {
        _lock: std::sync::MutexGuard<'a, ()>,
        _dir: tempfile::TempDir,
    }

    fn isolated_dir() -> IsolatedDir<'static> {
        let lock = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let dir = tempfile::tempdir().unwrap();
        std::env::set_var("COUNSEL_INCIDENTS_DIR", dir.path());
        IsolatedDir { _lock: lock, _dir: dir }
    }

    #[tokio::test]
    async fn writes_and_reads_back_a_record() {
        let _g = isolated_dir();
        let mut sizes = BTreeMap::new();
        sizes.insert("raw_input".into(), 42);
        sizes.insert("user_wiki".into(), 9001);
        let rec = IncidentRecord::new("p1", "s1", 2, "empty_response", "facilitator 0 chars")
            .with_duration(1234)
            .with_model("deepseek:deepseek-v4-flash")
            .with_ctx_sizes(sizes);
        record_incident(rec).await;

        let out = list_incidents(ListFilters::default()).await.unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, "empty_response");
        assert_eq!(out[0].ctx_sizes.get("user_wiki"), Some(&9001));
    }

    #[tokio::test]
    async fn filters_by_kind_and_step() {
        let _g = isolated_dir();
        record_incident(IncidentRecord::new("p", "s", 2, "empty_response", "x")).await;
        record_incident(IncidentRecord::new("p", "s", 4, "stuck_timeout", "y")).await;
        record_incident(IncidentRecord::new("p", "s", 2, "core_error", "z")).await;

        let only_step2 = list_incidents(ListFilters {
            days: Some(7),
            kind: None,
            step: Some(2),
        }).await.unwrap();
        assert_eq!(only_step2.len(), 2);

        let only_timeout = list_incidents(ListFilters {
            days: Some(7),
            kind: Some("stuck_timeout".into()),
            step: None,
        }).await.unwrap();
        assert_eq!(only_timeout.len(), 1);
        assert_eq!(only_timeout[0].step, 4);
    }

    #[tokio::test]
    async fn record_kind_constants() {
        // Sanity: callers should use these strings — keep them in sync with
        // admin UI filters.
        for k in ["empty_response", "stuck_timeout", "core_error", "stream_error"] {
            let r = IncidentRecord::new("p", "s", 2, k, "ok");
            assert_eq!(r.kind, k);
        }
    }
}
