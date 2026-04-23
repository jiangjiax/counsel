#!/bin/bash
# Quick start script for counsel-rust
# Usage: ./start.sh [deepseek|kimi|minimax|openai|dmx|laozhang|ollama]
#
# Examples:
#   ./start.sh deepseek          # Uses DeepSeek (requires DEEPSEEK_API_KEY env var)
#   DEEPSEEK_API_KEY=sk-xxx ./start.sh deepseek
#   ./start.sh                  # Defaults to deepseek

PROVIDER=${1:-deepseek}

# Default API keys (set to empty strings - user should provide their own)
export DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-""}
export KIMI_API_KEY=${KIMI_API_KEY:-""}
export MINIMAX_API_KEY=${MINIMAX_API_KEY:-""}
export OPENAI_API_KEY=${OPENAI_API_KEY:-""}
export DMX_API_KEY=${DMX_API_KEY:-""}
export LAOZHANG_API_KEY=${LAOZHANG_API_KEY:-""}

export RUST_LOG=info
export MODEL_PROVIDER=$PROVIDER
export STORAGE_ROOT=./sessions
export HOST=127.0.0.1

# Check if required API key is set
case $PROVIDER in
    deepseek)
        if [ -z "$DEEPSEEK_API_KEY" ]; then
            echo "Error: DEEPSEEK_API_KEY not set. Run: export DEEPSEEK_API_KEY=sk-your-key"
            exit 1
        fi
        ;;
    kimi)
        if [ -z "$KIMI_API_KEY" ]; then
            echo "Error: KIMI_API_KEY not set. Run: export KIMI_API_KEY=sk-your-key"
            exit 1
        fi
        ;;
    minimax)
        if [ -z "$MINIMAX_API_KEY" ]; then
            echo "Error: MINIMAX_API_KEY not set. Run: export MINIMAX_API_KEY=sk-your-key"
            exit 1
        fi
        ;;
    openai)
        if [ -z "$OPENAI_API_KEY" ]; then
            echo "Error: OPENAI_API_KEY not set. Run: export OPENAI_API_KEY=sk-your-key"
            exit 1
        fi
        ;;
    dmx)
        if [ -z "$DMX_API_KEY" ]; then
            echo "Error: DMX_API_KEY not set. Run: export DMX_API_KEY=sk-your-key"
            exit 1
        fi
        ;;
    laozhang)
        if [ -z "$LAOZHANG_API_KEY" ]; then
            echo "Error: LAOZHANG_API_KEY not set. Run: export LAOZHANG_API_KEY=sk-your-key"
            exit 1
        fi
        ;;
    ollama)
        echo "Using Ollama (local). Make sure Ollama is running on localhost:11434"
        ;;
esac

echo "Starting counsel-rust with provider: $PROVIDER"
cargo run --bin counsel-api
