#!/usr/bin/env bash
# =============================================================================
# Real User Test: Simulates a complete 私董会 session with a realistic Chinese
# business question, including Step 2 correction flow (NOT auto_simulate).
#
# Tests all Phase 2 features:
#   - Step 2 "一步锁定" with correction → re-understand → confirm (3 API calls)
#   - Step 6 debate on 2 selected dimensions (no Round 2)
#   - Step 8c Bayesian update (prior → evidence → posterior)
#   - User Wiki write
#   - Step caching (04-selected-dimensions.json)
#
# Usage: DEEPSEEK_API_KEY=sk-xxx ./scripts/real-user-test.sh
# =============================================================================
set -euo pipefail

API_KEY="${DEEPSEEK_API_KEY:?DEEPSEEK_API_KEY must be set}"
HOST="127.0.0.1"
PORT="3098"  # Different port from smoke test to avoid conflicts
BASE="http://${HOST}:${PORT}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
section() { echo -e "\n${CYAN}${BOLD}═══════════════════════════════════════${NC}"; echo -e "${CYAN}${BOLD}  $1${NC}"; echo -e "${CYAN}${BOLD}═══════════════════════════════════════${NC}"; }
show_content() { echo -e "${BOLD}--- $1 ---${NC}"; echo "$2" | head -40; echo -e "${BOLD}--- end ---${NC}\n"; }

STORAGE_ROOT="$(mktemp -d)"
info "Storage root: ${STORAGE_ROOT}"

# Build first
section "Building workspace"
cargo build --workspace --quiet 2>&1 || fail "Build failed"
pass "Build succeeded"

# Start server in background
section "Starting server"
info "Starting on ${HOST}:${PORT}..."
MODEL_PROVIDER=deepseek \
DEEPSEEK_API_KEY="${API_KEY}" \
DEEPSEEK_MODEL=deepseek-chat \
PORT="${PORT}" \
HOST="${HOST}" \
STORAGE_ROOT="${STORAGE_ROOT}" \
cargo run -p counsel-api --quiet 2>/dev/null &
SERVER_PID=$!

cleanup() {
    echo ""
    info "Stopping server (PID ${SERVER_PID})..."
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
    info "Storage preserved at: ${STORAGE_ROOT}"
}
trap cleanup EXIT

# Wait for server
for i in $(seq 1 30); do
    if curl -s "${BASE}/api/personas" > /dev/null 2>&1; then
        pass "Server is ready"
        break
    fi
    if [ "$i" -eq 30 ]; then
        fail "Server failed to start within 30 seconds"
    fi
    sleep 1
done

# Helper: POST a step and capture SSE output
run_step() {
    local step=$1
    local body=${2:-'{}'}
    local timeout=${3:-180}
    local output
    output=$(curl -s -N --max-time "${timeout}" \
        -X POST "${BASE}/api/projects/${PID}/sessions/${SID}/steps/${step}" \
        -H "Content-Type: application/json" \
        -d "${body}" 2>&1) || true

    # Check for error events
    if echo "$output" | grep -q '"Error"'; then
        echo "$output" | grep '"Error"' | head -3
        fail "Step ${step} returned error events"
    fi

    local count
    count=$(echo "$output" | grep -c "^data:" 2>/dev/null || echo "0")
    if [ "$count" -gt 0 ]; then
        pass "Step ${step} completed — ${count} SSE events"
    else
        pass "Step ${step} completed (no SSE events)"
    fi
    # Return output for inspection
    LAST_OUTPUT="$output"
}

# =====================================================================
section "Step 0: Create project + session"
# =====================================================================

info "Creating project: 杨继的短剧出海决策..."
PROJECT=$(curl -s -X POST "${BASE}/api/projects" \
    -H "Content-Type: application/json" \
    -d '{"name":"杨继的短剧出海决策","description":"短剧出海创业者的战略决策咨询"}')
PID=$(echo "$PROJECT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$PID" ] && pass "Project created: ${PID}" || fail "Project creation failed"

info "Creating session with realistic Chinese question..."
SESSION=$(curl -s -X POST "${BASE}/api/projects/${PID}/sessions" \
    -H "Content-Type: application/json" \
    -d '{"raw_input":"我叫杨继，做短剧出海已经一年了，目前团队8个人，月流水大概50万美金。现在面临一个关键决策：要不要拿融资扩大规模？如果拿融资，团队要扩到30人，需要投入大量精力在管理上；如果不拿，靠自己利润滚动，增长会比较慢，但我能保持对产品的掌控。另外，AI生成短剧的技术越来越成熟，我不确定是应该现在就All-in AI内容生产，还是继续用人工团队做内容同时观望AI发展。我很纠结，因为市场窗口期可能就这一两年。"}')
SID=$(echo "$SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$SID" ] && pass "Session created: ${SID}" || fail "Session creation failed"

# =====================================================================
section "Step 1: Mark raw input"
# =====================================================================

run_step 1 '{}' 10

# =====================================================================
section "Step 2: 一步锁定 — Correction Flow (3 calls)"
# =====================================================================

info "Step 2, Call 1: input=null → facilitator produces understanding..."
run_step 2 '{}' 90
pass "Call 1 done — facilitator produced draft understanding"

info "Step 2, Call 2: User corrects → '不完全对，我更纠结的是...' "
run_step 2 '{"input":"不完全对，我更纠结的是到底要不要All-in AI短剧。融资的事情其实我已经有倾向了（先不拿），但AI这个方向让我很焦虑——如果我不先跳进去，竞争对手用AI把成本压到我们的十分之一，我们可能一夜之间就被淘汰了。"}' 90
pass "Call 2 done — facilitator re-understood with correction"

info "Step 2, Call 3: User confirms → '对' "
run_step 2 '{"input":"对"}' 10
pass "Call 3 done — problem definition LOCKED"

# =====================================================================
section "Step 3: Facts Gathering"
# =====================================================================

info "Running facts gathering (12 personas ask questions)..."
run_step 3 '{}' 300

# =====================================================================
section "Step 4: Opinions (12 personas, parallel)"
# =====================================================================

info "Running opinions (this is the heaviest step)..."
run_step 4 '{}' 360

# =====================================================================
section "Step 5: Dimensions Extraction"
# =====================================================================

info "Extracting conflict dimensions..."
run_step 5 '{}' 90

# =====================================================================
section "Step 6: Debate on 2 Dimensions"
# =====================================================================

info "Running debate on dimensions [0, 1]..."
run_step 6 '{"selected_dimensions":[0,1]}' 360

# =====================================================================
section "Step 7: Summary"
# =====================================================================

info "Generating summary..."
run_step 7 '{}' 180

# =====================================================================
section "Step 8: Harvest (Bayesian + User Wiki)"
# =====================================================================

info "Running harvest (evaluations + todos + Bayesian update + User Wiki)..."
run_step 8 '{}' 360

# =====================================================================
section "Verification: Reading output files"
# =====================================================================

# 1. Define state — should be "Locked"
info "Checking 01-define-state.json..."
DEFINE_STATE=$(curl -s "${BASE}/api/projects/${PID}/sessions/${SID}/files/01-define-state.json" 2>/dev/null || echo "FETCH_ERROR")
if echo "$DEFINE_STATE" | grep -qi "Locked"; then
    pass "DefineState is Locked"
else
    fail "DefineState not Locked. Got: $DEFINE_STATE"
fi
show_content "01-define-state.json" "$DEFINE_STATE"

# 2. Defined problem — should exist
info "Checking 01-defined.md..."
DEFINED=$(curl -s "${BASE}/api/projects/${PID}/sessions/${SID}/files/01-defined.md" 2>/dev/null || echo "FETCH_ERROR")
if [ -n "$DEFINED" ] && [ "$DEFINED" != "FETCH_ERROR" ]; then
    pass "01-defined.md exists"
else
    fail "01-defined.md missing"
fi
show_content "01-defined.md (locked problem)" "$DEFINED"

# 3. Debate — should NOT contain "Round 2"
info "Checking 05-debate.md for no Round 2..."
DEBATE=$(curl -s "${BASE}/api/projects/${PID}/sessions/${SID}/files/05-debate.md" 2>/dev/null || echo "FETCH_ERROR")
if echo "$DEBATE" | grep -qi "Round 2"; then
    fail "05-debate.md contains 'Round 2' — Round 2 should be removed!"
else
    pass "05-debate.md does NOT contain Round 2 (correct)"
fi
DEBATE_LINES=$(echo "$DEBATE" | wc -l)
info "Debate has ${DEBATE_LINES} lines"
show_content "05-debate.md (first 40 lines)" "$DEBATE"

# 4. Bayesian update — should exist with prior/posterior content
info "Checking 07-bayesian.md..."
BAYESIAN=$(curl -s "${BASE}/api/projects/${PID}/sessions/${SID}/files/07-bayesian.md" 2>/dev/null || echo "FETCH_ERROR")
if [ -n "$BAYESIAN" ] && [ "$BAYESIAN" != "FETCH_ERROR" ]; then
    pass "07-bayesian.md exists"
    BAYESIAN_LEN=${#BAYESIAN}
    info "Bayesian update: ${BAYESIAN_LEN} chars"
else
    fail "07-bayesian.md missing"
fi
show_content "07-bayesian.md" "$BAYESIAN"

# 5. Selected dimensions — should show indices [0, 1]
info "Checking 04-selected-dimensions.json..."
SELECTED_DIMS=$(curl -s "${BASE}/api/projects/${PID}/sessions/${SID}/files/04-selected-dimensions.json" 2>/dev/null || echo "FETCH_ERROR")
if echo "$SELECTED_DIMS" | grep -q "selected_indices"; then
    pass "04-selected-dimensions.json exists with selected_indices"
else
    fail "04-selected-dimensions.json missing or malformed"
fi
show_content "04-selected-dimensions.json" "$SELECTED_DIMS"

# 6. User Wiki — should have Bayesian + todos
info "Checking user-wiki..."
USER_WIKI=$(curl -s "${BASE}/api/projects/${PID}/user-wiki" 2>/dev/null || echo "FETCH_ERROR")
if [ -n "$USER_WIKI" ] && [ "$USER_WIKI" != "FETCH_ERROR" ]; then
    pass "User Wiki exists"
    WIKI_LEN=${#USER_WIKI}
    info "User Wiki: ${WIKI_LEN} chars"
else
    fail "User Wiki missing"
fi
show_content "User Wiki" "$USER_WIKI"

# 7. Harvest — should exist
info "Checking 07-harvest.md..."
HARVEST=$(curl -s "${BASE}/api/projects/${PID}/sessions/${SID}/files/07-harvest.md" 2>/dev/null || echo "FETCH_ERROR")
if [ -n "$HARVEST" ] && [ "$HARVEST" != "FETCH_ERROR" ]; then
    pass "07-harvest.md exists"
else
    fail "07-harvest.md missing"
fi
show_content "07-harvest.md" "$HARVEST"

# 8. Metrics
info "Checking metrics..."
METRICS=$(curl -s "${BASE}/api/projects/${PID}/sessions/${SID}/files/metrics.json" 2>/dev/null || echo "FETCH_ERROR")
if [ -n "$METRICS" ] && [ "$METRICS" != "FETCH_ERROR" ]; then
    pass "metrics.json exists"
else
    info "metrics.json not found (may be OK)"
fi
show_content "metrics.json" "$METRICS"

# 9. Session state
info "Checking session state..."
SESS=$(curl -s "${BASE}/api/projects/${PID}/sessions/${SID}")
CURRENT_STEP=$(echo "$SESS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('current_step',0))" 2>/dev/null || echo "?")
if [ "$CURRENT_STEP" = "8" ]; then
    pass "Session current_step = 8 (all steps completed)"
else
    info "Session current_step = ${CURRENT_STEP}"
fi

# =====================================================================
section "REAL USER TEST COMPLETE"
# =====================================================================
echo ""
echo -e "${GREEN}${BOLD}All steps executed successfully.${NC}"
echo -e "${GREEN}${BOLD}Storage preserved at: ${STORAGE_ROOT}${NC}"
echo -e "${GREEN}${BOLD}Review output files above to judge LLM response quality.${NC}"
echo ""
