# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
uv sync

# Run dev server (requires Ollama running separately)
uv run uvicorn server:app --reload --port 8000

# Start Ollama (separate terminal)
ollama serve
```

## Architecture

Real-time AI drawing app that streams SVG from local Ollama via WebSocket.

```
Browser (vanilla JS) ←WebSocket→ FastAPI ←LiteLLM→ Ollama (gpt-oss:20b)
```

**Backend:**
- `server.py` - FastAPI app with WebSocket handler at `/ws/draw`, manages cancellation via `asyncio.Event`, serves static files
- `llm.py` - `LLMClient` class wrapping LiteLLM for async streaming from Ollama

**Frontend (static/):**
- `app.js` - `DrawingApp` class: WebSocket client, debounced input (300ms), progressive SVG rendering throttled to 30fps, reconnect with backoff
- `doodle.js` - Loading animation while waiting for LLM response
- `index.html`/`styles.css` - Minimal UI

**WebSocket Protocol:**
- Client sends: `draw` (with prompt, id), `cancel` (with id), `ping`
- Server sends: `start`, `chunk` (SVG fragment), `done`, `cancelled`, `error`, `pong`

**Key Constraints:**
- One active generation per WebSocket (new draw cancels existing)
- Prompt max 512 chars; buffer max 200k chars
- Timeouts: 30s start, 30s idle gap, 120s hard limit
