# Counsel Rust Cheatsheet

## Project

- **Name**: counsel-rust
- **Path**: /Users/a1-6/Documents/CC/05-ACTIVE-PROJECTS/counsel-rust
- **Owner**: a1-6 (Michael)
- **Goal**: Rust重构Counsel AI后端，极度优雅(Decent)、流式、多模型

---

## 🔬 做事情的方法论（系统化测试）

**遇到问题时**：
1. 把问题拆解成几个假设
2. 建立测试矩阵逐一验证
3. 从最可能的原因开始测试
4. 记录发现，更新优先级

---

## 🚨 最高优先级：优雅 (Decency)

**每次提交前必须检查**：

| 检查项 | 标准 | 自检 |
|--------|------|------|
| 无冗余代码 | 不要过度工程，不要有未使用的代码 | [ ] |
| 无重复定义 | 同一个东西只定义一次 | [ ] |
| 编译零警告 | `cargo build` 没有任何warning | [ ] |
| 命名清晰 | 变量/函数名自解释 | [ ] |
| 模块内聚 | 每个模块只做一件事 | [ ] |
| 错误友好 | 错误信息有用，不是panic | [ ] |
| 配置灵活 | 不硬编码，通过env/config | [ ] |

**优雅原则**：
1. **简洁** - 能删就删，代码是负债
2. **清晰** - 命名即文档
3. **可组合** - 小块拼大块
4. **本地优先** - 不依赖云端

---

## ❌ 犯过的错（不要重犯）

| 日期 | 错误 | 教训 | 应验检查 |
|------|------|------|----------|
| 2026-04-12 | async_trait生命周期问题 | BoxFuture显式返回比async fn更可控 | [x] |
| 2026-04-12 | steps/mod.rs和lib.rs重复impl CounselService | 模块职责要清晰，不能重复定义 | [x] |
| 2026-04-12 | SSE chunk逐字符发送 | 模型返回的chunk需要缓冲批量发送 | [x] |
| 2026-04-12 | main.rs硬编码Ollama | 所有配置都要通过env/config，不要硬编码 | [x] |
| 2026-04-12 | crate导入循环 | lib.rs导出不能循环引用自己的模块 | [x] |
| 2026-04-12 | Step 6调用run_dimensions()发射step_start(5) | Step路由不应调用其他Step的处理函数 | [x] |
| 2026-04-12 | 文本损坏 - DeepSeek回复乱码 | SSE流式解析使用filter_map只返回第一个事件，应用flat_map返回每个SSE事件 | [x] |
| 2026-04-12 | Step 4缺少Sun Tzu | DeepSeek流式解析bug导致部分chunk丢失，可能某个persona的chunk不完整 | [x] |
| 2026-04-12 | parse_dimensions()解析"Points of Contention"失败 | dimensions_prompt()输出"Points of Contention: One side...while the other side..."格式，parse_dimensions()只识别Pro/Con格式 | [x] |
| 2026-04-12 | DeepSeek非流式chat()返回空内容 | 默认chat()实现使用chat_stream()，对于非流式收集可能有问题 | [x] 已修复 - 实现独立的非流式chat() |

---

## 🔧 技术要点

### ModelProvider trait
```rust
// 用BoxFuture而非async fn避免生命周期问题
fn chat_stream(&self, messages: &[ChatMessage], options: ChatOptions) -> BoxFuture<'_, ModelResult<StreamingResponse>>;
```

### SSE缓冲
```rust
const BUFFER_THRESHOLD: usize = 50;  // 批量发送阈值
let mut buffer = String::new();
while let Some(chunk) = stream.next().await {
    buffer.push_str(&chunk);
    if buffer.len() >= BUFFER_THRESHOLD {
        sender.send(SensorChunk { chunk: buffer.clone() }).await?;
        buffer.clear();
    }
}
```

### 多模型选择
```bash
MODEL_PROVIDER=deepseek DEEPSEEK_API_KEY=xxx ./target/release/counsel-api
```

### Step 6 路由修复
```rust
// 错误：调用run_dimensions()会发射step_start(5)
// 正确：直接读取04-dimensions.md文件
let dimensions = state_clone.storage.read_session_file(&project_id_clone, &session_id_clone, "04-dimensions.md").await?;
let dims = counsel_core::steps::parse_dimensions(&dimensions);
```

### SSE流式解析修复
```rust
// 错误：filter_map每个HTTP chunk只返回1个item，多个SSE事件被丢弃
// 正确：使用flat_map，每个SSE事件都返回
Ok(Box::pin(stream.flat_map(|r| {
    match r {
        Ok(bytes) => {
            let items: Vec<Result<String, ModelError>> = text.lines()
                .filter_map(|line| { /* parse SSE */ })
                .collect();
            futures::stream::iter(items)
        }
        Err(e) => futures::stream::iter(vec![Err(e)]),
    }
})))
```

### parse_dimensions()格式修复
```rust
// dimensions_prompt()输出"Points of Contention: One side...while the other side..."格式
// parse_dimensions()需要解析这种格式
if let Some(separator_idx) = content.find(" while the other side ") {
    current_pro = content[..separator_idx].trim().to_string();
    let con_part = &content[separator_idx..];
    if let Some(stripped) = con_part.strip_prefix(" while the other side argues that ") {
        current_con = stripped.trim().to_string();
    }
    // ... 也支持 "The other side" (capital T)
}
```

### DeepSeek非流式chat()修复
```rust
// 默认chat()实现使用chat_stream()，但非流式收集有问题
// 正确：实现独立的非流式chat()，调用API时stream: false
fn chat(&self, messages: &[ChatMessage], options: ChatOptions) -> BoxFuture<'_, ModelResult<ChatResponse>> {
    let request = ChatRequest { stream: false, .. };
    let response = client.post(url).json(&request).send().await?;
    let resp_text = response.text().await?;
    let parsed: NonStreamResponse = serde_json::from_str(&resp_text)?;
    // 直接从JSON解析content字段
}
```

---

## 执行进度

### Phase 0: Foundation (COMPLETE 2026-04-18)
- [x] 模型Provider选择（环境变量）
- [x] SSE chunk缓冲优化（BUFFER_THRESHOLD=500）
- [x] Session状态修复
- [x] 完整流程测试（Step 2-8全部通过）
- [x] 代码清理警告
- [x] Step 6路由bug修复
- [x] DeepSeek流式解析bug修复
- [x] parse_dimensions()格式修复
- [x] DeepSeek非流式chat()修复

### Phase 1: Mock Tests + Live Smoke (COMPLETE 2026-04-19)
- [x] 11 Rust tests passing (mock + full 8-step flow)
- [x] Live DeepSeek smoke test: ALL 8 steps PASS
- [x] Script: `scripts/live-smoke-test.sh`

### Phase 2: Core Redesign (COMPLETE 2026-04-20)
- [x] Task A: Step 2 "一步锁定" state machine (DefineState::Init→Confirming→Locked)
- [x] Task B: User Wiki — Step 2 reads, Step 8 writes (project-root user-wiki.md)
- [x] Task C: Dimension default 3→2, max 3, saves selection JSON
- [x] Task D: Step 8c Bayesian update — prior→evidence→posterior→next hypothesis
- [x] Task E: Round 2 removed from debate — halves token cost
- [x] Task F: Step caching — force_refresh flag, file-existence checks
- [x] 14 Rust tests (4 flow + 10 mock)
- [x] Live DeepSeek: ALL 8 steps PASS
- [x] Real user test: `scripts/real-user-test.sh` — 杨继's 短剧出海 scenario, ALL PASS

### Phase 3: 5-layer Persona Architecture (COMPLETE 2026-04-21)
- [x] wisdom.rs: WisdomPersona, SituationCard, PressureFingerprint, VoiceTexture, PersonaRegistry
- [x] skills/ directory: 6 persona subdirs (2 full: mao-zedong, paul-graham; 4 stubs)
- [x] PersonaRegistry loaded from files at startup (replaces 3 disconnected persona systems)
- [x] All 8 step call-sites updated: `default_personas()` → `self.registry.all()`
- [x] Fallback chain: 5-layer KB → legacy prompt → basic description
- [x] 7 wisdom unit tests + 21 total tests passing
- [x] Live DeepSeek: ALL 8 steps PASS with 6 personas loaded
- Remaining content work: fill 4 persona stubs (Jobs, Bruce Lee, Kevin Kelly, 慧能)

### Phase 4: Advanced Features (NEXT)
- [ ] Round 2 conditional trigger (divergence check)
- [ ] Pre-Mortem analysis
- [ ] Session N+1 bootstrap
- [ ] Fill remaining 4 persona stubs with full 5-layer content + situation cards
- [ ] WE-INDEX evaluation scoring (24 test cases, 5 dimensions)
- [ ] Situation card matching in step prompts (pass user fingerprint)
- [ ] Persona A/B测试
- [ ] Settings页面（选择模型provider）

---

## 验证方法

```bash
# 编译检查
cargo build --release 2>&1 | grep -E "^error|^warning"

# 启动服务
MODEL_PROVIDER=deepseek DEEPSEEK_API_KEY=xxx ./target/release/counsel-api

# API测试
curl http://localhost:3000/api/personas
curl -X POST http://localhost:3000/api/projects -d '{"name":"test"}'
curl -X POST .../steps/2 -d '{"input":"test"}'
```

---

## 项目结构

```
counsel-rust/
├── Cargo.toml (workspace)
├── config.toml
├── skills/                 ← 6 persona知识库 (Phase 3)
│   ├── mao-zedong/         ← persona.json + theory.md + voice.md + situations/
│   ├── paul-graham/
│   ├── steve-jobs/         ← (stub)
│   ├── bruce-lee/          ← (stub)
│   ├── kevin-kelly/        ← (stub)
│   └── huineng/            ← (stub)
└── crates/
    ├── counsel-model/      ← ModelProvider trait + 7个实现
    ├── counsel-storage/    ← 文件系统存储
    ├── counsel-core/       ← wisdom.rs + Agent + 8步流程
    └── counsel-api/        ← HTTP + SSE
```

---

## 决策记录

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-04-12 | 用Rust重构 | 简洁、类型安全、并发优雅 |
| 2026-04-12 | 用BoxFuture解决async_trait问题 | 显式生命周期比隐式更可控 |
| 2026-04-12 | BUFFER_THRESHOLD=500 | 避免单词中间截断，在自然断点分割 |
| 2026-04-12 | 设计Rich Persona结构 | 包含Identity/Values/Framework/Style/BlindSpots字段，更好的角色一致性 |
| 2026-04-19 | Phase 1 mock+live验证 | 11个Rust测试 + live DeepSeek 8步全过 |
| 2026-04-20 | Phase 2 core redesign | Step 2一步锁定, Bayesian update, Wiki, 缓存, debate R2删除 |
| 2026-04-21 | Phase 3 persona KB | wisdom.rs + skills/ directory, 6 personas, fallback chain, 21 tests, live verified |
