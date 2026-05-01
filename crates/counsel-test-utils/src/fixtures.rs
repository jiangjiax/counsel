//! Test fixtures and helpers

use counsel_storage::Storage;
use tempfile::TempDir;

/// Create a Storage backed by a temporary directory.
/// Returns both the Storage and the TempDir handle (must be kept alive).
pub fn temp_storage() -> (Storage, TempDir) {
    let dir = TempDir::new().expect("failed to create temp dir");
    let storage = Storage::new(dir.path().to_path_buf());
    (storage, dir)
}

/// Create a Storage + project + session, returning (storage, project_id, session_id, _tmpdir).
pub async fn seed_session(
    raw_input: &str,
) -> (Storage, String, String, TempDir) {
    let (storage, dir) = temp_storage();
    let project = storage
        .create_project("test-project", Some("test project".to_string()))
        .await
        .expect("failed to create project");
    let session = storage
        .create_session(&project.id, raw_input.to_string())
        .await
        .expect("failed to create session");
    (storage, project.id, session.id, dir)
}

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

pub const TEST_PERSONA_ID: &str = "test-persona";
pub const TEST_PERSONA_NAME: &str = "Test Persona";
pub const TEST_PERSONA_TITLE: &str = "Test Advisor";
pub const TEST_PERSONA_DESCRIPTION: &str = "You are a test persona for unit tests.";
pub const TEST_USER_INPUT: &str = "I want to build a startup but I'm unsure about the market.";
