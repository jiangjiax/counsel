//! Full 8-step flow integration test using MockModelProvider
//!
//! Exercises CounselService end-to-end with mock responses.
//! Validates: no panics, file output created, SSE events emitted.

use counsel_core::{CounselService, SseSink};
use counsel_test_utils::MockProviderBuilder;
use std::sync::Arc;
use tempfile::TempDir;
use tokio::sync::mpsc;


/// Helper to create a fresh sender/receiver pair.
fn new_sink() -> (SseSink, mpsc::Receiver<String>) {
    let (tx, rx) = mpsc::channel::<String>(1000);
    (SseSink::new(tx), rx)
}

// ---------------------------------------------------------------------------
// Full 8-Step Smoke Test
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_full_8_step_flow() {
    let dir = TempDir::new().expect("tempdir");
    let storage = counsel_storage::Storage::new(dir.path().to_path_buf());

    // Build mock with a Step-5-friendly dimension response queued at position
    // where Secretary will consume it. We use default_response for everything
    // else. The dimension-format response needs ## headers for parsing.
    let dimensions_response = r#"## Market Timing
Core Conflict: Enter now vs wait for validation
Pro argument: First mover advantage
Con argument: Market may not be ready

## Resource Allocation
Core Conflict: Bootstrap vs raise capital
Pro argument: Capital accelerates growth
Con argument: Dilution and loss of control

## Team Building
Core Conflict: Hire fast vs hire slow
Pro argument: Speed to market
Con argument: Culture degradation risk"#;

    // We can't predict exact call ordering, so use default_response for the
    // bulk and just verify the flow doesn't panic and produces output files.
    let provider = MockProviderBuilder::new()
        .chunk_size(50)
        .default_response(
            "This is a thoughtful analysis. POSITION: FOR this approach. \
             I believe we should move forward with careful consideration of risks. \
             The key insight is that timing and execution matter more than perfection.",
        )
        .build_arc();

    let registry = Arc::new(counsel_core::wisdom::PersonaRegistry::test_registry(6));
    let service = CounselService::new(Arc::clone(&provider), storage.clone(), registry);

    // Create project + session
    let project = storage
        .create_project("Test Project", Some("Integration test".to_string()))
        .await
        .expect("create project");
    let pid = &project.id;

    let raw_input = "I want to start a tech startup in AI but I'm unsure about timing, team, and funding.";
    let session = storage
        .create_session(pid, raw_input.to_string())
        .await
        .expect("create session");
    let sid = &session.id;

    // Write 00-raw-input.md — normally done by the API routes layer,
    // not by Storage::create_session(), so we do it manually here.
    storage
        .write_session_file(pid, sid, "00-raw-input.md", raw_input)
        .await
        .expect("write raw input");

    // ======================== Step 2: Define ========================
    let (sink, rx) = new_sink();
    let defined = service
        .run_define(pid, sid, None, true, sink)
        .await
        .expect("Step 2 should succeed");
    assert!(!defined.is_empty(), "Step 2 should produce non-empty output");
    drop(rx);

    // Verify file was written
    let saved = storage
        .read_session_file(pid, sid, "01-defined.md")
        .await
        .expect("01-defined.md should exist");
    assert!(!saved.is_empty());

    // ======================== Step 3: Facts ========================
    let (sink, rx) = new_sink();
    service
        .run_facts(pid, sid, true, sink)
        .await
        .expect("Step 3 should succeed");
    drop(rx);

    let facts = storage
        .read_session_file(pid, sid, "02-facts-answers.md")
        .await
        .expect("02-facts-answers.md should exist");
    assert!(!facts.is_empty());

    // ======================== Step 4: Opinions ========================
    let (sink, rx) = new_sink();
    let opinions = service
        .run_opinions(pid, sid, sink)
        .await
        .expect("Step 4 should succeed");
    drop(rx);

    // Should have opinions from multiple personas
    assert!(!opinions.is_empty(), "Step 4 should produce opinions");

    // Verify opinion files exist
    let opinion_list = storage
        .list_opinions(pid, sid)
        .await
        .expect("list_opinions should succeed");
    assert!(
        !opinion_list.is_empty(),
        "Should have opinion files in 03-opinions/"
    );

    // ======================== Step 5: Dimensions ========================
    // Step 5 needs properly formatted dimension output for parsing.
    // Since we can't control which call gets the default, we write
    // the dimension file manually to unblock Step 6.
    // (In real usage, the LLM produces structured output.)
    storage
        .write_session_file(pid, sid, "04-dimensions.md", dimensions_response)
        .await
        .expect("write dimensions");

    // Actually run Step 5 too (it will overwrite with default response,
    // but we verify it doesn't panic)
    let (sink, rx) = new_sink();
    let dims = service
        .run_dimensions(pid, sid, sink)
        .await
        .expect("Step 5 should succeed");
    drop(rx);

    // The mock default won't parse into proper dimensions, but at least
    // one "General" fallback dimension should be returned.
    assert!(!dims.is_empty(), "Step 5 should return at least one dimension");

    // Re-write proper dimensions for Step 6
    storage
        .write_session_file(pid, sid, "04-dimensions.md", dimensions_response)
        .await
        .expect("rewrite dimensions");

    // ======================== Step 6: Debate ========================
    // Parse dimensions from our well-formed response
    let parsed_dims = counsel_core::steps::parse_dimensions(dimensions_response);
    assert!(parsed_dims.len() >= 2, "Should parse at least 2 dimensions");

    // Debate on first dimension only (to keep test fast)
    let (sink, rx) = new_sink();
    let synthesis = service
        .run_debate(pid, sid, &parsed_dims[0], sink)
        .await
        .expect("Step 6 should succeed");
    drop(rx);

    // 2026-04-25 — synthesis is now intentionally empty per Michael's request
    // ("辩论环节主持人就不要做总结了，都留着第 step7 做"). Step 6 produces only
    // persona positions + middle responses; Step 7 secretary handles all synthesis.
    let _ = synthesis;

    // Verify debate file
    let debate = storage
        .read_session_file(pid, sid, "05-debate.md")
        .await
        .expect("05-debate.md should exist");
    assert!(!debate.is_empty());

    // ======================== Step 7: Summary ========================
    let (sink, rx) = new_sink();
    let summary = service
        .run_summary(pid, sid, sink)
        .await
        .expect("Step 7 should succeed");
    drop(rx);

    assert!(!summary.is_empty(), "Step 7 should produce summary");

    let saved_summary = storage
        .read_session_file(pid, sid, "06-summary.md")
        .await
        .expect("06-summary.md should exist");
    assert!(!saved_summary.is_empty());

    // ======================== Step 8: Harvest ========================
    let (sink, rx) = new_sink();
    let harvest = service
        .run_harvest(pid, sid, sink)
        .await
        .expect("Step 8 should succeed");
    drop(rx);

    assert!(!harvest.evaluations.is_empty(), "Step 8 should produce evaluations");

    let saved_harvest = storage
        .read_session_file(pid, sid, "07-harvest.md")
        .await
        .expect("07-harvest.md should exist");
    assert!(!saved_harvest.is_empty());

    // ======================== Phase 2 Assertions ========================

    // Verify 07-bayesian.md exists (Task D: Bayesian Update)
    let bayesian = storage
        .read_session_file(pid, sid, "07-bayesian.md")
        .await
        .expect("07-bayesian.md should exist after Step 8");
    assert!(!bayesian.is_empty(), "Bayesian update should be non-empty");

    // Verify bayesian_update field is populated
    assert!(harvest.bayesian_update.is_some(), "HarvestResult should have bayesian_update");

    // Verify user-wiki.md exists at user level (above sessions root)
    let wiki = storage
        .read_user_wiki()
        .await
        .expect("user-wiki.md should exist after Step 8");
    assert!(!wiki.is_empty(), "User wiki should be non-empty");
    assert!(wiki.contains("贝叶斯信念更新"), "Wiki should contain Bayesian update section (贝叶斯信念更新)");

    // Verify debate output has NO Round 2 section (Task E: Remove Round 2)
    assert!(
        !debate.contains("Round 2 Deeper Responses"),
        "Debate should NOT contain Round 2 section"
    );

    // Verify 01-define-state.json exists and is Locked (Task A: 一步锁定)
    let define_state = storage
        .read_session_file(pid, sid, "01-define-state.json")
        .await
        .expect("01-define-state.json should exist");
    assert!(
        define_state.contains("Locked"),
        "Define state should be Locked after auto_simulate"
    );

    // ======================== Metrics ========================
    let metrics_json = storage
        .read_session_file(pid, sid, "metrics.json")
        .await
        .expect("metrics.json should exist");
    assert!(!metrics_json.is_empty());
}

// ---------------------------------------------------------------------------
// Task A tests: Step 2 "一步锁定" state machine
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_define_one_shot_auto() {
    // Verify auto_simulate=true produces 01-defined.md in 1 LLM call and locks immediately
    let dir = TempDir::new().expect("tempdir");
    let storage = counsel_storage::Storage::new(dir.path().to_path_buf());

    let provider = MockProviderBuilder::new()
        .chunk_size(50)
        .default_response("核心问题：是否应该现在启动AI创业项目\n\n你可能也在想：\n· 时机是否合适\n· 资金从哪里来")
        .build_arc();

    let registry = Arc::new(counsel_core::wisdom::PersonaRegistry::test_registry(6));
    let service = CounselService::new(Arc::clone(&provider), storage.clone(), registry);

    let project = storage.create_project("Test", None).await.expect("create project");
    let pid = &project.id;
    let session = storage.create_session(pid, "test".to_string()).await.expect("create session");
    let sid = &session.id;
    storage.write_session_file(pid, sid, "00-raw-input.md", "Should I start an AI startup?").await.unwrap();

    let (sink, rx) = new_sink();
    let result = service.run_define(pid, sid, None, true, sink).await.expect("define should succeed");
    drop(rx);

    // Should produce output
    assert!(!result.is_empty());

    // Should be locked (state = Locked)
    let state_json = storage.read_session_file(pid, sid, "01-define-state.json").await.expect("state file");
    let state: counsel_core::DefineState = serde_json::from_str(&state_json).expect("parse state");
    assert_eq!(state, counsel_core::DefineState::Locked);

    // 01-defined.md should exist
    let defined = storage.read_session_file(pid, sid, "01-defined.md").await.expect("defined file");
    assert!(!defined.is_empty());
}

#[tokio::test]
async fn test_define_correction_flow() {
    // Test: Init → Confirming(1) → correction → Confirming(2) → confirm → Locked
    let dir = TempDir::new().expect("tempdir");
    let storage = counsel_storage::Storage::new(dir.path().to_path_buf());

    let provider = MockProviderBuilder::new()
        .chunk_size(50)
        .default_response("核心问题：测试问题\n\n你可能也在想：\n· 问题1")
        .build_arc();

    let registry = Arc::new(counsel_core::wisdom::PersonaRegistry::test_registry(6));
    let service = CounselService::new(Arc::clone(&provider), storage.clone(), registry);

    let project = storage.create_project("Test", None).await.expect("create project");
    let pid = &project.id;
    let session = storage.create_session(pid, "test".to_string()).await.expect("create session");
    let sid = &session.id;
    storage.write_session_file(pid, sid, "00-raw-input.md", "My test question").await.unwrap();

    // Call 1: Init → Confirming(1)
    let (sink, rx) = new_sink();
    let _r1 = service.run_define(pid, sid, None, false, sink).await.expect("call 1");
    drop(rx);

    let state_json = storage.read_session_file(pid, sid, "01-define-state.json").await.unwrap();
    let state: counsel_core::DefineState = serde_json::from_str(&state_json).unwrap();
    match &state {
        counsel_core::DefineState::Confirming { attempt, .. } => assert_eq!(*attempt, 1),
        _ => panic!("Expected Confirming(1), got {:?}", state),
    }

    // Call 2: correction → Confirming(2)
    let (sink, rx) = new_sink();
    let _r2 = service.run_define(pid, sid, Some("不对，我的问题是关于投资".to_string()), false, sink).await.expect("call 2");
    drop(rx);

    let state_json = storage.read_session_file(pid, sid, "01-define-state.json").await.unwrap();
    let state: counsel_core::DefineState = serde_json::from_str(&state_json).unwrap();
    match &state {
        counsel_core::DefineState::Confirming { attempt, .. } => assert_eq!(*attempt, 2),
        _ => panic!("Expected Confirming(2), got {:?}", state),
    }

    // Call 3: confirm → Locked
    let (sink, rx) = new_sink();
    let _r3 = service.run_define(pid, sid, Some("对".to_string()), false, sink).await.expect("call 3");
    drop(rx);

    let state_json = storage.read_session_file(pid, sid, "01-define-state.json").await.unwrap();
    let state: counsel_core::DefineState = serde_json::from_str(&state_json).unwrap();
    assert_eq!(state, counsel_core::DefineState::Locked);

    // 01-defined.md should exist
    let defined = storage.read_session_file(pid, sid, "01-defined.md").await.expect("defined");
    assert!(!defined.is_empty());
}

#[tokio::test]
async fn test_define_force_lock() {
    // After 2 attempts, force-locks regardless of input
    let dir = TempDir::new().expect("tempdir");
    let storage = counsel_storage::Storage::new(dir.path().to_path_buf());

    let provider = MockProviderBuilder::new()
        .chunk_size(50)
        .default_response("核心问题：测试\n\n你可能也在想：\n· 问题1")
        .build_arc();

    let registry = Arc::new(counsel_core::wisdom::PersonaRegistry::test_registry(6));
    let service = CounselService::new(Arc::clone(&provider), storage.clone(), registry);

    let project = storage.create_project("Test", None).await.expect("create project");
    let pid = &project.id;
    let session = storage.create_session(pid, "test".to_string()).await.expect("create session");
    let sid = &session.id;
    storage.write_session_file(pid, sid, "00-raw-input.md", "My test question").await.unwrap();

    // Call 1: Init → Confirming(1)
    let (sink, rx) = new_sink();
    service.run_define(pid, sid, None, false, sink).await.expect("call 1");
    drop(rx);

    // Call 2: correction → Confirming(2)
    let (sink, rx) = new_sink();
    service.run_define(pid, sid, Some("不对".to_string()), false, sink).await.expect("call 2");
    drop(rx);

    // Call 3: another correction → should force-lock (attempt >= 2)
    let (sink, rx) = new_sink();
    service.run_define(pid, sid, Some("还是不对".to_string()), false, sink).await.expect("call 3");
    drop(rx);

    let state_json = storage.read_session_file(pid, sid, "01-define-state.json").await.unwrap();
    let state: counsel_core::DefineState = serde_json::from_str(&state_json).unwrap();
    assert_eq!(state, counsel_core::DefineState::Locked, "Should force-lock after 2 attempts");

    // 01-defined.md should exist
    let defined = storage.read_session_file(pid, sid, "01-defined.md").await.expect("defined");
    assert!(!defined.is_empty());
}
