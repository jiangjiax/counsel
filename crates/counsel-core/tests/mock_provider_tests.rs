//! Integration tests for MockModelProvider + PersonaAgent

use counsel_model::{ChatMessage, ChatOptions, ModelProvider};
use counsel_test_utils::{
    CallMethod, MockErrorKind, MockProviderBuilder, TEST_PERSONA_DESCRIPTION, TEST_PERSONA_ID,
    TEST_PERSONA_NAME, TEST_PERSONA_TITLE,
};
use counsel_core::{SSEEvent, SseSink};
use counsel_core::agents::{Agent, PersonaAgent};
use futures::StreamExt;
use std::sync::Arc;
use tokio::sync::mpsc;

// ---------------------------------------------------------------------------
// Helper: collect SSE events from a channel
// ---------------------------------------------------------------------------

fn sse_collector() -> (SseSink, tokio::task::JoinHandle<Vec<SSEEvent>>) {
    let (tx, mut rx) = mpsc::channel::<String>(100);
    let sink = SseSink::new(tx);
    let handle = tokio::spawn(async move {
        let mut events = Vec::new();
        while let Some(data) = rx.recv().await {
            if let Some(json) = data.strip_prefix("data: ") {
                if let Ok(event) = serde_json::from_str::<SSEEvent>(json.trim()) {
                    events.push(event);
                }
            }
        }
        events
    });
    (sink, handle)
}

fn test_messages() -> Vec<ChatMessage> {
    vec![
        ChatMessage::system("You are a test persona."),
        ChatMessage::user("What should I do?"),
    ]
}

fn test_options() -> ChatOptions {
    ChatOptions::default()
}

fn make_persona(provider: Arc<dyn ModelProvider>) -> PersonaAgent {
    PersonaAgent::new(
        TEST_PERSONA_ID,
        TEST_PERSONA_NAME,
        TEST_PERSONA_TITLE,
        TEST_PERSONA_DESCRIPTION,
        provider,
    )
}

// ---------------------------------------------------------------------------
// Test 1: MockModelProvider streams chunks correctly
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_mock_provider_streams_chunks() {
    let provider = MockProviderBuilder::new()
        .chunk_size(5)
        .with_response("Hello world")
        .build();

    let stream = provider
        .chat_stream(&test_messages(), test_options())
        .await
        .expect("chat_stream should succeed");

    futures::pin_mut!(stream);
    let mut collected = String::new();
    while let Some(chunk) = stream.next().await {
        collected.push_str(&chunk.expect("chunk should be Ok"));
    }

    assert_eq!(collected, "Hello world");
}

// ---------------------------------------------------------------------------
// Test 2: MockModelProvider returns error
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_mock_provider_returns_error() {
    let provider = MockProviderBuilder::new()
        .with_error(MockErrorKind::Api("rate limited".into()))
        .build();

    let result = provider
        .chat_stream(&test_messages(), test_options())
        .await;

    let err = match result {
        Err(e) => e,
        Ok(_) => panic!("expected error, got Ok"),
    };
    assert!(err.to_string().contains("rate limited"), "error should contain 'rate limited', got: {err}");
}

// ---------------------------------------------------------------------------
// Test 3: MockModelProvider records calls
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_mock_provider_call_recording() {
    let provider = MockProviderBuilder::new()
        .with_response("response 1")
        .with_response("response 2")
        .build();

    // Call chat (non-streaming)
    let _ = provider.chat(&test_messages(), test_options()).await;
    // Call chat_stream
    let _ = provider.chat_stream(&test_messages(), test_options()).await;

    assert_eq!(provider.call_count(), 2);

    let calls = provider.calls();
    assert_eq!(calls[0].method, CallMethod::Chat);
    assert_eq!(calls[1].method, CallMethod::ChatStream);
    // Verify messages were captured
    assert_eq!(calls[0].messages.len(), 2);
    assert_eq!(calls[0].messages[1].content, "What should I do?");
}

// ---------------------------------------------------------------------------
// Test 4: PersonaAgent streaming produces correct SSE event sequence
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_persona_agent_streaming_sse_events() {
    let provider = MockProviderBuilder::new()
        .chunk_size(100) // single chunk for simplicity
        .with_response("This is my advice on your situation.")
        .build_arc();

    let persona = make_persona(provider);
    let (sink, handle) = sse_collector();

    persona
        .run_streaming(&test_messages(), test_options(), sink)
        .await
        .expect("run_streaming should succeed");

    // Drop is implicit — when run_streaming returns, the SseSink clone is
    // dropped, but the collector's rx won't close until all SseSink clones
    // are dropped. We need to give it a moment or drop explicitly. The
    // persona doesn't hold the sink after returning, so the channel will
    // close when the last clone is dropped.
    let events = handle.await.expect("collector task should complete");

    // Expect: PersonaStart, PersonaChunk(s), PersonaDone
    assert!(events.len() >= 3, "expected at least 3 events, got {}", events.len());

    // First event: PersonaStart
    match &events[0] {
        SSEEvent::PersonaStart { name } => {
            assert_eq!(name, TEST_PERSONA_NAME);
        }
        other => panic!("expected PersonaStart, got: {other:?}"),
    }

    // Middle events: PersonaChunk(s)
    for event in &events[1..events.len() - 1] {
        match event {
            SSEEvent::PersonaChunk { name, chunk } => {
                assert_eq!(name, TEST_PERSONA_NAME);
                assert!(!chunk.is_empty(), "chunk should not be empty");
            }
            other => panic!("expected PersonaChunk, got: {other:?}"),
        }
    }

    // Last event: PersonaDone
    match events.last().unwrap() {
        SSEEvent::PersonaDone { name } => {
            assert_eq!(name, TEST_PERSONA_NAME);
        }
        other => panic!("expected PersonaDone, got: {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// Test 5: PersonaAgent returns error on empty response
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_persona_agent_empty_response_error() {
    let provider = MockProviderBuilder::new()
        .with_empty_stream()
        .build_arc();

    let persona = make_persona(provider);

    // The non-streaming `run` method calls `model.chat()`, which for
    // EmptyStream returns an empty string. PersonaAgent::run checks for
    // empty content and returns AgentError::Generic.
    let result = persona.run(&test_messages(), test_options()).await;

    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(
        err.to_string().contains("empty response"),
        "expected 'empty response' in error, got: {err}"
    );
}

// ---------------------------------------------------------------------------
// Test 6: Queue exhaustion falls back to default
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_mock_provider_queue_then_default() {
    let provider = MockProviderBuilder::new()
        .with_response("first")
        .with_response("second")
        .default_response("fallback")
        .build();

    // Call 1: "first"
    let r1 = provider.chat(&test_messages(), test_options()).await.unwrap();
    assert_eq!(r1.content, "first");

    // Call 2: "second"
    let r2 = provider.chat(&test_messages(), test_options()).await.unwrap();
    assert_eq!(r2.content, "second");

    // Call 3: queue empty → default "fallback"
    let r3 = provider.chat(&test_messages(), test_options()).await.unwrap();
    assert_eq!(r3.content, "fallback");

    // Call 4: still default
    let r4 = provider.chat(&test_messages(), test_options()).await.unwrap();
    assert_eq!(r4.content, "fallback");

    assert_eq!(provider.call_count(), 4);
    assert_eq!(provider.remaining(), 0);
}

// ---------------------------------------------------------------------------
// Test 7: categorize_position does not panic on Chinese text
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_categorize_position_chinese_no_panic() {
    // 400 Chinese characters — previously panicked at byte-slice &upper[..300]
    let chinese_text = "我".repeat(400);
    let result = counsel_core::CounselService::categorize_position(&chinese_text);
    // Should not panic and should return a valid category
    assert!(
        result == "pro" || result == "con" || result == "middle",
        "expected pro/con/middle, got: {result}"
    );
}

// ---------------------------------------------------------------------------
// Test 8: categorize_position detects pro/con/middle keywords
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_categorize_position_keywords() {
    assert_eq!(
        counsel_core::CounselService::categorize_position("POSITION: FOR this proposal"),
        "pro"
    );
    assert_eq!(
        counsel_core::CounselService::categorize_position("POSITION: AGAINST this approach"),
        "con"
    );
    assert_eq!(
        counsel_core::CounselService::categorize_position("I see BOTH SIDES of this argument"),
        "middle"
    );
}

// ---------------------------------------------------------------------------
// Test 9: run_streaming_collect streams AND returns accumulated text
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_run_streaming_collect() {
    let provider = MockProviderBuilder::new()
        .chunk_size(10)
        .with_response("This is the collected response text.")
        .build_arc();

    let persona = make_persona(provider);
    let (sink, handle) = sse_collector();

    let result = persona
        .run_streaming_collect(&test_messages(), test_options(), sink)
        .await
        .expect("run_streaming_collect should succeed");

    // Verify accumulated text matches
    assert_eq!(result, "This is the collected response text.");

    // Verify SSE events were sent
    let events = handle.await.expect("collector should complete");
    assert!(events.len() >= 3, "expected at least 3 SSE events");

    // First: PersonaStart
    match &events[0] {
        SSEEvent::PersonaStart { name } => assert_eq!(name, TEST_PERSONA_NAME),
        other => panic!("expected PersonaStart, got: {other:?}"),
    }

    // Last: PersonaDone
    match events.last().unwrap() {
        SSEEvent::PersonaDone { name } => assert_eq!(name, TEST_PERSONA_NAME),
        other => panic!("expected PersonaDone, got: {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// Test 10: run_streaming_collect returns error on empty stream
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_run_streaming_collect_empty_error() {
    let provider = MockProviderBuilder::new()
        .with_empty_stream()
        .build_arc();

    let persona = make_persona(provider);
    let (sink, _handle) = sse_collector();

    let result = persona
        .run_streaming_collect(&test_messages(), test_options(), sink)
        .await;

    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(
        err.to_string().contains("empty response"),
        "expected 'empty response', got: {err}"
    );
}
