# Counsel-Rust Testing Journal

## Context
Testing the counsel-rust project with MiniMax and DeepSeek API providers.

**User Request**: "quality over speed, so try the best of those api providers"

---

## What We Did

### Phase 1: Initial Exploration & First Tests
- Explored the project structure: Rust Cargo workspace with 4 crates
  - `counsel-api` - HTTP server
  - `counsel-core` - Business logic, agents, steps
  - `counsel-model` - API providers (MiniMax, DeepSeek, Ollama, etc.)
  - `counsel-storage` - File-based session storage
- Set up API keys for MiniMax and DeepSeek
- Ran initial tests - discovered cascade failure problem

### Phase 2: Bug Fixes Applied

| Bug | File | Problem | Fix |
|-----|------|---------|-----|
| **#1** | `prompts.rs:511` | Byte index slicing `&rich_prompt[..300]` hit Chinese char boundary (panic) | Changed to `chars().take(300).collect::<String>()` |
| **#2** | `minimax.rs` | Missing `chat()` implementation - default collected empty strings from failed stream | Added proper non-streaming `chat()` method |
| **#3** | `secretary.rs` | `run_streaming()` returned `Ok(())` with zero content (send errors ignored) | Added `total_sent` tracking, error if zero |
| **#4** | `agents/mod.rs` | `PersonaAgent::run()` returned empty content without error | Added empty content check |
| **#5** | `steps/mod.rs` | `max_tokens: 200000` excessively large - API rejection | Reduced: 2400 streaming, 1500-3000 non-streaming |
| **#6** | `deepseek.rs` | No HTTP status checking | Added `status.is_success()` check |

### Phase 3: Max Tokens Reduction (7 occurrences)

All `max_tokens: 200000` changed to reasonable values:

| Location | Old | New | Purpose |
|----------|-----|-----|---------|
| Step 4 opinions streaming | 200000 | 2400 | Streaming buffer |
| Step 4 opinions final | 200000 | 3000 | Final opinion response |
| Step 5+ streaming | 200000 | 2400 | Debate streaming |
| Step 5+ final | 200000 | 3000 | Debate final response |
| Step 7 summary | 200000 | 1500 | Secretary summary |
| Step 8 harvest personas | 200000 | 3000 | Persona evaluations |
| Step 8 harvest todos | 200000 | 1500 | Todo extraction |

---

## Current Test Results (DeepSeek - Most Recent Run)

| Step | Name | Duration | Output | Status |
|------|------|----------|--------|--------|
| 2 | Define | 160s | 235 chars | OK |
| 3 | Facts | 180s | 12,577 chars | OK |
| 4 | Opinions | 300s | IO error (file not found) | **FAILED** |
| 5+ | Deep Dive+ | - | - | Not reached |

**Error**: `"error":"IO error: No such file or directory (os error 2)"`

---

## Cascade Failure Chain

```
Step 4 (Opinions) fails → Step 5/6 (Debate/Dimensions) partial → Step 7/8 empty
       ↑
  persona.run_streaming() errors dropped silently
  rx.recv() returns early
  0-byte opinion files saved
```

### How It Cascades
1. `run_opinions` spawns 12 persona tasks in parallel via `JoinSet`
2. Each persona calls `run_streaming()` + `run()`
3. If streaming fails, error is dropped (only `eprintln!`)
4. `rx.recv()` may return early if a sender drops
5. Opinion files are created but empty (0 bytes)
6. Steps 5/6 try to use these empty files - partial content
7. Steps 7/8 receive no usable content - empty output

---

## Outstanding Problems NOT Fully Resolved

### 1. Step 4 IO Error - Opinion Files Not Saving Properly
- **Location**: `run_opinions` in `steps/mod.rs`
- **Symptom**: IO error when saving opinion files
- **Likely cause**: Parallel tasks may fail before creating files, or directory structure issue

### 2. Token Metrics Are Wrong
- **Location**: Metrics saving in `steps/mod.rs`
- **Symptom**: `prompt_tokens == completion_tokens` in metrics (clearly wrong)
- **Cause**: `estimate_messages_tokens()` returns approximate values, not actual API tokens

### 3. Silent Error Handling in `run_opinions`
- **Location**: `steps/mod.rs:540` etc.
- **Code**: `if let Err(e) = persona.run_streaming(...).await { eprintln!(...) }`
- **Problem**: Errors are logged but not propagated - step continues with partial data

### 4. Step 6 Debate Loop Ignores Errors
- **Location**: `routes/steps.rs`
- **Code**: `let _ = service.run_debate(...)`
- **Problem**: Errors silently ignored

---

## Files Modified

### `crates/counsel-core/src/prompts.rs`
- Fixed byte-slicing panic with character-aware truncation

### `crates/counsel-core/src/agents/mod.rs`
- Added empty content check to `PersonaAgent::run()`

### `crates/counsel-core/src/agents/secretary.rs`
- Added `total_sent` tracking in `run_streaming()`
- Added error if zero content streamed
- Added empty content check to `run()`

### `crates/counsel-core/src/steps/mod.rs`
- Reduced `max_tokens` from 200000 to 2400-3000

### `crates/counsel-model/src/minimax.rs`
- Added proper non-streaming `chat()` method
- Added `NonStreamResponse`, `ResponseUsage` structs

### `crates/counsel-model/src/deepseek.rs`
- Added HTTP status code checking after API response

---

## Next Steps to Investigate

1. **IO Error in Step 4**: Trace `run_opinions` to find why files aren't being created
2. **Persona Streaming Failures**: Add better error collection from parallel tasks
3. **Metrics Accuracy**: Use actual API token counts instead of estimates
4. **Re-run Tests**: After fixes, verify Steps 7/8 produce meaningful output

---

## Test Commands Used

```bash
# DeepSeek test
DEEPSEEK_API_KEY="sk-b8a3ac54d8fd4fe1b965491b7eaa5df9" MODEL_PROVIDER="deepseek" cargo run --bin counsel-api
node test_deepseek_full.js

# MiniMax test
MINIMAX_API_KEY="..." MINIMAX_GROUP_ID="..." MODEL_PROVIDER="minimax" cargo run --bin counsel-api
node test_minimax_full.js
```

---

*Last updated: 2026-04-17*
