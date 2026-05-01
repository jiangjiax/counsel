//! File storage utilities

use super::{Storage, StorageResult};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Byte budget for `core.md`. Mirrors AAAK's 1500-char cap. Once exceeded
/// during `upsert_core_facts`, oldest facts are evicted in FIFO order until
/// the rendered file fits.
pub const CORE_BUDGET: usize = 1500;

/// One core fact. Serialised as a single line:
/// `[entity | relation | fact | yyyy-mm-dd]`. Spaces around the pipe are
/// tolerated by the parser but always emitted on write.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoreFact {
    pub entity: String,
    pub relation: String,
    pub fact: String,
    pub date: String,
}

impl CoreFact {
    pub fn to_line(&self) -> String {
        format!(
            "[{} | {} | {} | {}]",
            self.entity.trim(),
            self.relation.trim(),
            self.fact.trim(),
            self.date.trim(),
        )
    }

    pub fn parse(line: &str) -> Option<Self> {
        let s = line.trim();
        let s = s.strip_prefix('[')?;
        let s = s.strip_suffix(']')?;
        let parts: Vec<&str> = s.splitn(4, '|').map(|p| p.trim()).collect();
        if parts.len() != 4 { return None; }
        // Reject empty entity/relation/fact (date may be missing in legacy data).
        if parts[0].is_empty() || parts[1].is_empty() || parts[2].is_empty() {
            return None;
        }
        Some(Self {
            entity: parts[0].to_string(),
            relation: parts[1].to_string(),
            fact: parts[2].to_string(),
            date: parts[3].to_string(),
        })
    }
}

/// Two-blob context the facilitator always loads. `core` is small (≤1.5KB),
/// `index` is one line per past session (~80 chars × N).
#[derive(Debug, Clone, Default)]
pub struct UserContext {
    pub core: String,
    pub index: String,
}

/// Pull `(date, project, hook)` from a log/{sid}.md body. Used by
/// `rebuild_log_index` to compose one-line entries. Hook is taken from the
/// `### 锁定议题` block when present, else the first non-empty paragraph.
fn extract_hook(body: &str) -> (String, String, String) {
    let mut date = String::new();
    let mut project = String::new();
    if let Some(first) = body.lines().next() {
        // First line was "## 项目 {pid} · 会话 {sid} ({date})".
        if let Some(rest) = first.strip_prefix("## 项目").or_else(|| first.strip_prefix("# 项目")) {
            // rest = " {pid} · 会话 {sid} ({date})"
            if let Some(open) = rest.rfind('(') {
                let end = rest.rfind(')').unwrap_or(rest.len());
                if open + 1 <= end {
                    date = rest[open + 1..end].trim().to_string();
                }
                let head = &rest[..open];
                project = head.split('·').next().unwrap_or("").trim().to_string();
            }
        }
    }

    // Walk the body to find `### 锁定议题` then take the next non-empty line.
    let mut hook = String::new();
    let mut found = false;
    for line in body.lines() {
        if found {
            let l = line.trim();
            if !l.is_empty() && !l.starts_with('#') {
                hook = l.to_string();
                break;
            }
        }
        if line.trim().starts_with("### 锁定议题") {
            found = true;
        }
    }
    if hook.is_empty() {
        // Fallback: first non-empty paragraph past the heading.
        for line in body.lines().skip(1) {
            let l = line.trim();
            if !l.is_empty() && !l.starts_with('#') {
                hook = l.to_string();
                break;
            }
        }
    }

    // Cap at 80 chars (counted by chars, not bytes — CJK-safe).
    let trimmed: String = hook.chars().take(80).collect();
    (date, project, trimmed)
}

/// Walk `dir` recursively and insert every file into `out` keyed by path
/// relative to `base`. Used by `collect_session_files`.
fn collect_dir_recursive<'a>(
    base: &'a Path,
    dir: &'a Path,
    out: &'a mut HashMap<String, String>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = StorageResult<()>> + Send + 'a>> {
    Box::pin(async move {
        let mut entries = tokio::fs::read_dir(dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_dir() {
                collect_dir_recursive(base, &path, out).await?;
            } else if path.is_file() {
                if let Ok(rel) = path.strip_prefix(base) {
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    if let Ok(content) = tokio::fs::read_to_string(&path).await {
                        out.insert(rel_str, content);
                    }
                }
            }
        }
        Ok(())
    })
}

impl Storage {
    /// Get path for a session file like "00-raw-input.md" or "01-defined.md"
    pub fn session_file(&self, project_id: &str, session_id: &str, filename: &str) -> PathBuf {
        self.session_dir(project_id, session_id).join(filename)
    }

    /// Write content to a session file
    pub async fn write_session_file(
        &self,
        project_id: &str,
        session_id: &str,
        filename: &str,
        content: &str,
    ) -> StorageResult<()> {
        let path = self.session_file(project_id, session_id, filename);
        tokio::fs::create_dir_all(path.parent().unwrap()).await?;
        tokio::fs::write(&path, content).await?;
        Ok(())
    }

    /// Read content from a session file
    pub async fn read_session_file(
        &self,
        project_id: &str,
        session_id: &str,
        filename: &str,
    ) -> StorageResult<String> {
        let path = self.session_file(project_id, session_id, filename);
        let content = tokio::fs::read_to_string(&path).await?;
        Ok(content)
    }

    /// Path for the user-level wiki (one file per user, across all projects).
    /// Located at the parent of the sessions root (e.g. `./user-wiki.md` when
    /// storage root is `./sessions`). Falls back to root if no parent exists.
    fn user_wiki_path(&self) -> PathBuf {
        let base = self.root.parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| self.root.clone());
        base.join("user-wiki.md")
    }

    /// Read the user-level wiki (single file per user, spans all projects).
    pub async fn read_user_wiki(&self) -> StorageResult<String> {
        let path = self.user_wiki_path();
        match tokio::fs::read_to_string(&path).await {
            Ok(content) => Ok(content),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
            Err(e) => Err(e.into()),
        }
    }

    /// Write the user-level wiki.
    pub async fn write_user_wiki(&self, content: &str) -> StorageResult<()> {
        let path = self.user_wiki_path();
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&path, content).await?;
        Ok(())
    }

    /// Path for a project-level belief-system.md (Phase 2.8). Stores the
    /// latest Bayesian posterior as markdown — overwritten on each Step 8
    /// completion. Session N+1's facilitator reads it as structured prior.
    fn belief_system_path(&self, project_id: &str) -> PathBuf {
        self.project_dir(project_id).join("belief-system.md")
    }

    /// Read the project-level belief-system.md (Phase 2.8). Returns empty
    /// string if absent (first session in this project).
    pub async fn read_belief_system(&self, project_id: &str) -> StorageResult<String> {
        let path = self.belief_system_path(project_id);
        match tokio::fs::read_to_string(&path).await {
            Ok(content) => Ok(content),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
            Err(e) => Err(e.into()),
        }
    }

    /// Overwrite the project-level belief-system.md with the latest Bayesian
    /// posterior. Called at end of `run_harvest`.
    pub async fn write_belief_system(&self, project_id: &str, content: &str) -> StorageResult<()> {
        let path = self.belief_system_path(project_id);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&path, content).await?;
        Ok(())
    }

    /// User-level execution journal (Phase 2.3 follow-up assistant).
    /// Sibling of user-wiki.md; records responses to past commitments
    /// (e.g., "a week after committing to X, the client did/didn't/rethought").
    fn execution_journal_path(&self) -> PathBuf {
        let base = self.root.parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| self.root.clone());
        base.join("execution-journal.md")
    }

    pub async fn read_execution_journal(&self) -> StorageResult<String> {
        let path = self.execution_journal_path();
        match tokio::fs::read_to_string(&path).await {
            Ok(content) => Ok(content),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
            Err(e) => Err(e.into()),
        }
    }

    /// Phase C — overwrite the execution journal with content received from
    /// the client (used when hydrating a temp Storage per request).
    pub async fn write_execution_journal(&self, content: &str) -> StorageResult<()> {
        let path = self.execution_journal_path();
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&path, content).await?;
        Ok(())
    }

    pub async fn append_execution_journal(&self, entry: &str) -> StorageResult<()> {
        let path = self.execution_journal_path();
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let existing = self.read_execution_journal().await.unwrap_or_default();
        let updated = if existing.trim().is_empty() {
            format!("# 行动执行日志（Execution Journal）\n\n*每次\"跟进\"时，案主对过去承诺的更新记录。幕僚会在后续 session 读取这里，看你说到做到了吗。*\n{}", entry)
        } else {
            format!("{}{}", existing, entry)
        };
        tokio::fs::write(&path, updated).await?;
        Ok(())
    }

    /// Read the most recent session's entry from user-wiki.md (Phase 4.3 —
    /// Session N+1 auto-inherit). Entries are `---`-separated blocks written by
    /// `run_harvest` on each Step 8 completion. Returns empty string if no prior
    /// sessions exist yet. The latest `---`-separated non-empty block wins.
    pub async fn read_last_wiki_entry(&self) -> StorageResult<String> {
        let wiki = self.read_user_wiki().await?;
        if wiki.trim().is_empty() {
            return Ok(String::new());
        }
        // Split on lines that are exactly "---" (the separator written by run_harvest).
        let blocks: Vec<&str> = wiki
            .split("\n---\n")
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        // First block is the header "# User Wiki ..." — skip it. Take the last
        // block that begins with "## Project" (a real session entry).
        let entry = blocks
            .iter()
            .rev()
            .find(|b| b.starts_with("## Project"))
            .map(|s| s.to_string())
            .unwrap_or_default();
        Ok(entry)
    }

    /// Get the step output file name
    pub fn step_file(step: u8) -> String {
        match step {
            0 => "00-raw-input.md".to_string(),
            1 => "01-defined.md".to_string(),
            2 => "02-facts-answers.md".to_string(),
            3 => "03-opinions".to_string(),
            4 => "04-dimensions.md".to_string(),
            5 => "05-debate.md".to_string(),
            6 => "06-summary.md".to_string(),
            7 => "07-harvest.md".to_string(),
            _ => format!("{:02}-step-{}.md", step, step),
        }
    }

    /// Phase 7.1 — read the case-owner's picked advisor subset for this session.
    /// Returns an empty Vec if no file exists (caller treats that as "use all").
    pub async fn read_selected_personas(&self, project_id: &str, session_id: &str) -> Vec<String> {
        #[derive(serde::Deserialize)]
        struct Picks { selected: Vec<String> }
        let path = self.session_file(project_id, session_id, "99-personas.json");
        match tokio::fs::read_to_string(&path).await {
            Ok(content) => serde_json::from_str::<Picks>(&content)
                .map(|p| p.selected)
                .unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    }

    /// Phase 7.1 — persist the case-owner's picked advisor subset. Overwrites
    /// any prior file. Caller enforces the 1..=12 cap.
    pub async fn write_selected_personas(
        &self,
        project_id: &str,
        session_id: &str,
        selected: &[String],
    ) -> StorageResult<()> {
        #[derive(serde::Serialize)]
        struct Picks<'a> { selected: &'a [String] }
        let path = self.session_file(project_id, session_id, "99-personas.json");
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let body = serde_json::to_string_pretty(&Picks { selected })?;
        tokio::fs::write(&path, body).await?;
        Ok(())
    }

    /// Phase C — walk the entire session directory (including `03-opinions/`
    /// subdir) and return `{ filename_relative_to_session: content }`. Used by
    /// the step handler to emit everything the step wrote back to the client so
    /// it can land in IndexedDB. Sub-dir entries come back as e.g.
    /// `03-opinions/Paul-Graham.md`.
    pub async fn collect_session_files(
        &self,
        project_id: &str,
        session_id: &str,
    ) -> StorageResult<std::collections::HashMap<String, String>> {
        let dir = self.session_dir(project_id, session_id);
        let mut files = std::collections::HashMap::new();
        if !dir.exists() {
            return Ok(files);
        }
        collect_dir_recursive(&dir, &dir, &mut files).await?;
        Ok(files)
    }

    /// Phase C — read user-level files (wiki + execution-journal + project
    /// belief-system + B3 tier files) into a tidy map for the response. Keys
    /// match what the client persists in IndexedDB (one entry per file). The
    /// tier files are reported under namespaced keys so the legacy keys
    /// keep their meanings:
    ///   - `user-data/core.md`
    ///   - `user-data/log/INDEX.md`
    ///   - `user-data/log/{sid}.md` (one per session that has a log file)
    pub async fn collect_user_files(
        &self,
        project_id: &str,
    ) -> StorageResult<std::collections::HashMap<String, String>> {
        let mut out = std::collections::HashMap::new();
        if let Ok(wiki) = self.read_user_wiki().await {
            if !wiki.is_empty() { out.insert("user-wiki.md".to_string(), wiki); }
        }
        if let Ok(ej) = self.read_execution_journal().await {
            if !ej.is_empty() { out.insert("execution-journal.md".to_string(), ej); }
        }
        if let Ok(bs) = self.read_belief_system(project_id).await {
            if !bs.is_empty() { out.insert("belief-system.md".to_string(), bs); }
        }
        // B3 tier files
        if let Ok(core) = self.read_user_core().await {
            if !core.is_empty() { out.insert("user-data/core.md".to_string(), core); }
        }
        if let Ok(idx) = self.read_log_index().await {
            if !idx.is_empty() { out.insert("user-data/log/INDEX.md".to_string(), idx); }
        }
        let log_dir = self.user_log_dir();
        if log_dir.exists() {
            if let Ok(mut entries) = tokio::fs::read_dir(&log_dir).await {
                while let Ok(Some(e)) = entries.next_entry().await {
                    let path = e.path();
                    let name = match path.file_name().and_then(|n| n.to_str()) {
                        Some(n) => n.to_string(),
                        None => continue,
                    };
                    if !name.ends_with(".md") || name == "INDEX.md" { continue; }
                    if let Ok(body) = tokio::fs::read_to_string(&path).await {
                        out.insert(format!("user-data/log/{}", name), body);
                    }
                }
            }
        }
        Ok(out)
    }

    // ─── User-data tier (B1) ─────────────────────────────────────────────
    //
    // Replaces the single ever-growing `user-wiki.md` with a tiered layout
    // that keeps `core` tiny (always-loaded) and pushes per-session detail
    // into a logbook indexed by one-line hooks. Inspired by the AAAK + wiki
    // pattern in `~/.michael_agent/`.
    //
    //   user-data/
    //     core.md                 ≤ CORE_BUDGET bytes, line format
    //                             `[entity | relation | fact | yyyy-mm-dd]`
    //     log/
    //       INDEX.md              one line per session-log file
    //       {session_id}.md       full per-session block (was a slice of the
    //                             legacy user-wiki.md)
    //
    // Sibling of `user-wiki.md` — same `parent(storage_root)` resolution so
    // tempdir-mode (Phase C) works without further plumbing.

    fn user_data_dir(&self) -> PathBuf {
        let base = self.root.parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| self.root.clone());
        base.join("user-data")
    }

    pub fn user_core_path(&self) -> PathBuf { self.user_data_dir().join("core.md") }
    pub fn user_log_dir(&self) -> PathBuf { self.user_data_dir().join("log") }
    pub fn user_log_index_path(&self) -> PathBuf { self.user_log_dir().join("INDEX.md") }
    pub fn user_log_session_path(&self, session_id: &str) -> PathBuf {
        // Defence-in-depth against weird sids (e.g. containing `/`).
        let safe: String = session_id.chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        self.user_log_dir().join(format!("{}.md", safe))
    }

    pub async fn read_user_core(&self) -> StorageResult<String> {
        match tokio::fs::read_to_string(self.user_core_path()).await {
            Ok(c) => Ok(c),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
            Err(e) => Err(e.into()),
        }
    }

    pub async fn write_user_core(&self, content: &str) -> StorageResult<()> {
        let path = self.user_core_path();
        if let Some(p) = path.parent() { tokio::fs::create_dir_all(p).await?; }
        tokio::fs::write(&path, content).await?;
        Ok(())
    }

    pub async fn read_log_index(&self) -> StorageResult<String> {
        match tokio::fs::read_to_string(self.user_log_index_path()).await {
            Ok(c) => Ok(c),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
            Err(e) => Err(e.into()),
        }
    }

    pub async fn write_log_index(&self, content: &str) -> StorageResult<()> {
        let path = self.user_log_index_path();
        if let Some(p) = path.parent() { tokio::fs::create_dir_all(p).await?; }
        tokio::fs::write(&path, content).await?;
        Ok(())
    }

    pub async fn read_log_session(&self, session_id: &str) -> StorageResult<String> {
        match tokio::fs::read_to_string(self.user_log_session_path(session_id)).await {
            Ok(c) => Ok(c),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
            Err(e) => Err(e.into()),
        }
    }

    pub async fn write_log_session(&self, session_id: &str, content: &str) -> StorageResult<()> {
        let path = self.user_log_session_path(session_id);
        if let Some(p) = path.parent() { tokio::fs::create_dir_all(p).await?; }
        tokio::fs::write(&path, content).await?;
        Ok(())
    }

    /// Tier read: returns `(core, index)` — the two blobs that the facilitator
    /// always loads. Detailed per-session content stays on disk as
    /// `log/{sid}.md` and is fetched on demand (not by this call).
    pub async fn read_user_context(&self) -> StorageResult<UserContext> {
        let core = self.read_user_core().await.unwrap_or_default();
        let index = self.read_log_index().await.unwrap_or_default();
        Ok(UserContext { core, index })
    }

    /// Merge new fact lines into core.md. Existing fact lines (matched by
    /// `[entity | relation` prefix) are deduplicated — newer wins, oldest
    /// gets evicted when the total size exceeds CORE_BUDGET bytes.
    pub async fn upsert_core_facts(&self, new_facts: &[CoreFact]) -> StorageResult<()> {
        if new_facts.is_empty() { return Ok(()); }
        let existing = self.read_user_core().await.unwrap_or_default();

        // Parse existing into ordered Vec<CoreFact>. Lines that don't match
        // the format are kept verbatim as a header block at the top.
        let mut header_lines: Vec<String> = Vec::new();
        let mut facts: Vec<CoreFact> = Vec::new();
        for line in existing.lines() {
            if let Some(f) = CoreFact::parse(line) {
                facts.push(f);
            } else if facts.is_empty() {
                header_lines.push(line.to_string());
            }
            // Lines after the first parsed fact that don't parse are dropped
            // — they're stale comments from a previous schema. Header is
            // always preserved as long as it precedes any fact.
        }

        // Dedupe + upsert: for each new fact, remove any existing match by
        // (entity, relation), then push to the front so newest wins.
        for nf in new_facts {
            facts.retain(|f| !(f.entity == nf.entity && f.relation == nf.relation));
            facts.insert(0, nf.clone());
        }

        // Ensure header is reasonable (write a default if empty).
        if header_lines.iter().all(|l| l.trim().is_empty()) {
            header_lines = vec![
                String::from("# 案主核心事实（Core）"),
                String::new(),
                String::from("*跨 session 复用、案主身份层级。每行一条 `[实体 | 关系 | 事实 | 日期]`，按最近优先排序。超过预算时最旧的会被挤出。*"),
                String::new(),
            ];
        }

        // Render and enforce budget.
        let render = |facts: &[CoreFact], header: &[String]| -> String {
            let mut s = header.join("\n");
            if !s.ends_with('\n') { s.push('\n'); }
            for f in facts {
                s.push_str(&f.to_line());
                s.push('\n');
            }
            s
        };

        while {
            let s = render(&facts, &header_lines);
            s.len() > CORE_BUDGET && !facts.is_empty()
        } {
            facts.pop();
        }

        let final_content = render(&facts, &header_lines);
        self.write_user_core(&final_content).await
    }

    /// Rebuild `log/INDEX.md` from the current contents of `log/*.md`.
    /// One line per file, newest first, format:
    /// `- [YYYY-MM-DD · 项目名](sid.md) — ≤80 字 hook`.
    pub async fn rebuild_log_index(&self) -> StorageResult<()> {
        let dir = self.user_log_dir();
        if !dir.exists() {
            return self.write_log_index("").await;
        }
        let mut entries = tokio::fs::read_dir(&dir).await?;
        let mut rows: Vec<(String, String)> = Vec::new(); // (sort_key, line)
        while let Some(e) = entries.next_entry().await? {
            let p = e.path();
            let name = match p.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            if !name.ends_with(".md") || name == "INDEX.md" { continue; }
            let sid = name.trim_end_matches(".md").to_string();
            let body = tokio::fs::read_to_string(&p).await.unwrap_or_default();
            let (date, project, hook) = extract_hook(&body);
            // Sort by date (yyyy-mm-dd lex == chrono); fall back to mtime.
            let sort_key = if date.is_empty() {
                format!("0000-00-00:{}", name)
            } else {
                format!("{}:{}", date, name)
            };
            let line = format!(
                "- [{}{}{}]({}.md) — {}",
                date,
                if !date.is_empty() && !project.is_empty() { " · " } else { "" },
                project,
                sid,
                hook,
            );
            rows.push((sort_key, line));
        }
        rows.sort_by(|a, b| b.0.cmp(&a.0)); // newest first
        let mut out = String::from("# 案主经历索引（Log Index）\n\n");
        out.push_str("*每行 ≤80 字，hook = 那次 session 的核心议题。点击文件名读详情。*\n\n");
        for (_, line) in rows {
            out.push_str(&line);
            out.push('\n');
        }
        self.write_log_index(&out).await
    }

    /// One-time migration from legacy `user-wiki.md` to `log/{sid}.md` files.
    /// Idempotent — if `user-data/.migrated` exists, returns 0 immediately.
    /// Backs up the original to `user-wiki.md.pre-tier.bak`.
    pub async fn migrate_user_wiki_to_log(&self) -> StorageResult<usize> {
        let stamp = self.user_data_dir().join(".migrated");
        if stamp.exists() { return Ok(0); }

        let wiki = self.read_user_wiki().await.unwrap_or_default();
        if wiki.trim().is_empty() {
            // Even with no data we still write the stamp so we don't keep
            // re-checking on every startup.
            tokio::fs::create_dir_all(self.user_data_dir()).await.ok();
            tokio::fs::write(&stamp, "").await.ok();
            return Ok(0);
        }

        let mut migrated = 0_usize;
        for block in wiki.split("\n---\n") {
            let block = block.trim();
            if block.is_empty() || !block.starts_with("## 项目") {
                continue; // header block / blank
            }
            // Extract sid from "## 项目 {pid} · 会话 {sid} ({date})".
            let sid = block.lines().next()
                .and_then(|l| l.split("会话").nth(1))
                .and_then(|s| s.split('(').next())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            let sid = match sid {
                Some(s) => s,
                None => continue,
            };
            self.write_log_session(&sid, block).await.ok();
            migrated += 1;
        }
        // Build the index from disk now that all files are written.
        self.rebuild_log_index().await.ok();

        // Back up the original; leave core.md empty (will accumulate via
        // future harvest extracts).
        let bak_path = self.user_wiki_path().with_extension("md.pre-tier.bak");
        let _ = tokio::fs::rename(self.user_wiki_path(), &bak_path).await;

        tokio::fs::create_dir_all(self.user_data_dir()).await.ok();
        tokio::fs::write(&stamp, chrono::Utc::now().to_rfc3339()).await.ok();

        Ok(migrated)
    }

    /// Read opinions directory for step 3
    pub async fn list_opinions(&self, project_id: &str, session_id: &str) -> StorageResult<Vec<(String, String)>> {
        let dir = self.session_dir(project_id, session_id).join("03-opinions");
        let mut opinions = Vec::new();
        if !dir.exists() {
            return Ok(opinions);
        }
        let mut entries = tokio::fs::read_dir(&dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
                let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
                let content = tokio::fs::read_to_string(&path).await?;
                opinions.push((name, content));
            }
        }
        Ok(opinions)
    }
}

#[cfg(test)]
mod tier_tests {
    use super::*;

    fn make_storage() -> (tempfile::TempDir, Storage) {
        let td = tempfile::tempdir().unwrap();
        // Use `td/sessions` as root so that `parent` (= td path) exists for
        // user-wiki.md / user-data/ resolution.
        let root = td.path().join("sessions");
        std::fs::create_dir_all(&root).unwrap();
        let s = Storage::new(root);
        (td, s)
    }

    #[test]
    fn core_fact_roundtrip() {
        let f = CoreFact {
            entity: "案主".into(),
            relation: "职业".into(),
            fact: "投资人 → 想转向产品创始人".into(),
            date: "2026-04-30".into(),
        };
        let line = f.to_line();
        let parsed = CoreFact::parse(&line).unwrap();
        assert_eq!(f, parsed);
    }

    #[test]
    fn core_fact_rejects_malformed() {
        assert!(CoreFact::parse("案主 | 职业 | 投资人 | 2026-04-30").is_none()); // no brackets
        assert!(CoreFact::parse("[案主 | | x | 2026-04-30]").is_none()); // empty relation
        assert!(CoreFact::parse("[case]").is_none()); // not enough fields
    }

    #[tokio::test]
    async fn upsert_dedupes_by_entity_relation() {
        let (_td, s) = make_storage();
        s.upsert_core_facts(&[CoreFact {
            entity: "案主".into(), relation: "目标".into(),
            fact: "做产品".into(), date: "2026-04-01".into(),
        }]).await.unwrap();
        s.upsert_core_facts(&[CoreFact {
            entity: "案主".into(), relation: "目标".into(),
            fact: "做产品 + 找联合创始人".into(), date: "2026-04-29".into(),
        }]).await.unwrap();
        let core = s.read_user_core().await.unwrap();
        // Only one matching line should remain — the new one.
        let count = core.lines().filter(|l| l.contains("案主 | 目标")).count();
        assert_eq!(count, 1);
        assert!(core.contains("找联合创始人"));
        assert!(!core.contains("做产品 ]")); // old fact body absent
    }

    #[tokio::test]
    async fn upsert_evicts_oldest_when_over_budget() {
        let (_td, s) = make_storage();
        // Each fact line is ~70 chars; 30 of them blows past the 1500-byte
        // budget and forces eviction.
        for i in 0..30 {
            s.upsert_core_facts(&[CoreFact {
                entity: format!("e{i:02}"),
                relation: format!("r{i:02}"),
                fact: format!("padding-padding-padding-padding-padding-{i:02}"),
                date: "2026-04-30".into(),
            }]).await.unwrap();
        }
        let core = s.read_user_core().await.unwrap();
        assert!(core.len() <= CORE_BUDGET, "core overshoot: {} > {}", core.len(), CORE_BUDGET);
        // Newest stays (e29), oldest gets evicted (e00 must be gone).
        assert!(core.contains("e29 | r29"));
        assert!(!core.contains("e00 | r00"));
    }

    #[tokio::test]
    async fn migration_splits_legacy_wiki_idempotently() {
        let (td, s) = make_storage();
        let wiki_path = td.path().join("user-wiki.md");
        let legacy = "# 案主画像\n\n*placeholder header*\n\n---\n## 项目 p1 · 会话 sid-aaa (2026-04-01)\n\n### 锁定议题\n该不该接 X 的 offer？\n\n### 案主自己的反思\n保留可选性。\n\n---\n## 项目 p1 · 会话 sid-bbb (2026-04-15)\n\n### 锁定议题\n如何说服联合创始人减薪 6 个月？\n\n### 案主自己的反思\n用股权换。\n";
        tokio::fs::write(&wiki_path, legacy.to_string()).await.unwrap();

        let n = s.migrate_user_wiki_to_log().await.unwrap();
        assert_eq!(n, 2, "should have migrated 2 session blocks");

        let saa = s.read_log_session("sid-aaa").await.unwrap();
        assert!(saa.contains("该不该接 X"));
        let sbb = s.read_log_session("sid-bbb").await.unwrap();
        assert!(sbb.contains("如何说服联合创始人"));

        let idx = s.read_log_index().await.unwrap();
        assert!(idx.contains("sid-aaa.md"));
        assert!(idx.contains("sid-bbb.md"));
        // Newest first by date.
        let pos_a = idx.find("sid-aaa.md").unwrap();
        let pos_b = idx.find("sid-bbb.md").unwrap();
        assert!(pos_b < pos_a, "newest (sid-bbb, 2026-04-15) should appear before sid-aaa");

        // Backup exists.
        assert!(td.path().join("user-wiki.md.pre-tier.bak").exists());
        // Stamp prevents re-migration.
        let n2 = s.migrate_user_wiki_to_log().await.unwrap();
        assert_eq!(n2, 0);
    }

    #[tokio::test]
    async fn migration_on_empty_wiki_is_noop_but_stamps() {
        let (_td, s) = make_storage();
        let n = s.migrate_user_wiki_to_log().await.unwrap();
        assert_eq!(n, 0);
        // Second call should also return 0 (stamp present).
        let n2 = s.migrate_user_wiki_to_log().await.unwrap();
        assert_eq!(n2, 0);
    }

    #[tokio::test]
    async fn read_user_context_returns_empty_when_no_data() {
        let (_td, s) = make_storage();
        let ctx = s.read_user_context().await.unwrap();
        assert!(ctx.core.is_empty());
        assert!(ctx.index.is_empty());
    }
}
