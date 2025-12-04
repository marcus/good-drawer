# Good Drawer

Real-time AI drawing with streaming SVG via local Ollama.

## Setup

```bash
# Install dependencies
uv sync

# Start Ollama (separate terminal)
ollama serve

# Run server
uv run uvicorn server:app --reload --port 8000
```

Open http://localhost:8000

## Features

- Type a prompt, see SVG drawn progressively
- 300ms debounce (Enter bypasses)
- Escape clears input
- Graceful cancellation on new input
- Reconnects on disconnect
- Mobile-friendly

## Architecture

- Frontend: vanilla HTML/CSS/JS
- Backend: FastAPI + WebSocket
- LLM: LiteLLM + Ollama (gpt-oss:20b)
