//! File storage utilities

use super::{Storage, StorageResult};
use std::path::PathBuf;

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
