# Good Drawer — Real-time AI Drawing Spec

## Goals and Non-Goals
- Goals: magical zero-friction drawing, immediate visual feedback, reliable cancellation, resilient to malformed SVG, works offline with local Ollama.
- Non-goals: user accounts/persistence, cloud inference, saving drawings, collaborative sessions.

## Experience Narrative
1. User focuses the input and starts typing (e.g., "a cat on a windowsill").
2. Existing drawing fades to 0% over 200ms and the canvas clears.
3. After 300ms debounce (or Enter to bypass), a `draw` request is sent.
4. Within 500ms the first SVG chunk begins streaming; canvas updates as chunks land.
5. If the user types again, the in-flight stream is cancelled within 100ms and a new request starts.
6. Errors show brief feedback but never stall the UI; typing always remains responsive.

## System Architecture
```
┌─────────────────────────────────────────────────────────┐
│                     Browser (UI)                        │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │   Text Input    │───▶│       SVG Canvas            │ │
│  │  (debounced)    │    │  (progressive rendering)    │ │
│  └────────┬────────┘    └─────────────────────────────┘ │
│           │ WebSocket                                   │
└───────────┼─────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────┐
│                   Python Backend                         │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │ FastAPI/WS      │◀──▶│     LLM Client              │ │
│  │   Handler       │    │  (LiteLLM + Ollama)         │ │
│  └─────────────────┘    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│              Ollama (localhost:11434)                    │
│              Model: gpt-oss:20b                          │
└─────────────────────────────────────────────────────────┘
```

## Frontend
- Stack: vanilla HTML/CSS/JS served from `/static`; no build step.
- Layout: full-height view with large centered SVG area, input docked at bottom. Input always visible on mobile.
- Input behavior: 300ms debounce; Enter sends immediately; Escape clears; clear (×) button when text exists; autofocus on load.
- Canvas behavior: `preserveAspectRatio="xMidYMid meet"`; light background; drop shadow; responsive to viewport changes.
- Streaming UI: subtle border pulse while waiting for first chunk; SVG itself is the streaming indicator; errors flash red and reset after 3s.
- Keyboard/mobility: supports keyboard-only; input and clear button focusable; status text announced via `aria-live="polite"`.
- Offline expectations: works when Ollama is local and cached; surface connection issues inline.

### Rendering Strategy
- Maintain a streaming buffer string; render on each chunk (throttled to ~30fps).
- Parse with `DOMParser`; if parsing fails, keep last valid SVG mounted.
- Wrap partial SVG in a fallback `<svg viewBox="0 0 400 400">` container when incomplete.
- Guard against unbounded growth: cap buffer at 200k chars; if exceeded, stop requesting more and show "Too complex."

### WebSocket Protocol (UI)
- Connect to `ws://<host>/ws/draw`.
- Client messages:
  - `{"type": "draw", "prompt": "<string>", "id": "<uuid>"}` (prompt trimmed; empty prompts ignored client-side)
  - `{"type": "cancel", "id": "<uuid>"}` (last issued id)
- Server messages:
  - `{"type": "start", "id": "<uuid>"}` — acknowledges and resets UI state
  - `{"type": "chunk", "id": "<uuid>", "data": "<svg fragment>"}` — append to buffer
  - `{"type": "done", "id": "<uuid>"}` — finalize render
  - `{"type": "error", "message": "<human readable>", "id": "<uuid>"}` — show inline error
  - `{"type": "cancelled", "id": "<uuid>"}` — stop rendering; UI already clears
- Heartbeats: client sends `{"type":"ping"}` every 20s; server responds `{"type":"pong"}`. Reconnect with backoff (0.5s → 2s → 5s, cap 10s).

## Backend
- Stack: Python 3.11+, FastAPI (or Starlette), Uvicorn, LiteLLM. Static files served by FastAPI at `/`.
- Primary endpoint: `GET /` serves `index.html`; `WebSocket /ws/draw` handles streaming.
- Dependencies (pyproject):
  ```toml
  [project]
  dependencies = [
      "fastapi>=0.104.0",
      "uvicorn>=0.24.0",
      "websockets>=12.0",
      "litellm>=1.79.3",
  ]
  ```
- Validation: trim prompt; reject if empty or >512 chars with `error` message; sanitize control characters.
- Timeouts: start chunk deadline 1s; idle chunk gap 8s; request hard limit 30s. On timeout, send `error` then close stream.
- Concurrency: one active generation per WebSocket. New `draw` sets a cancel flag, waits for current task to end, then starts new task.
- Observability: log `first_chunk_ms`, `total_duration_ms`, `cancelled`, and `error_reason`. Count reconnects.

### Streaming Handler (shape)
```python
async def handle_draw(websocket, prompt: str, cancel_event: asyncio.Event):
    system_prompt = """You are an SVG artist. Output ONLY SVG code.
- Begin with <svg> and end with </svg>
- Use viewBox="0 0 400 400"
- No markdown, no narration
- Prefer <path> and <g>; cohesive colors; simple, expressive forms"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Draw: {prompt}"},
    ]

    await websocket.send_json({"type": "start", "id": req_id})

    async for chunk in llm_client.stream_completion(messages, temperature=0.9):
        if cancel_event.is_set():
            await websocket.send_json({"type": "cancelled", "id": req_id})
            return
        await websocket.send_json({"type": "chunk", "data": chunk, "id": req_id})

    await websocket.send_json({"type": "done", "id": req_id})
```

### LLM Configuration
- Model: `ollama/gpt-oss:20b` (local).
- Temperature: 0.9; max tokens: 800 (keeps SVG concise); top_p default.
- System prompt above; ensure no code fences.
- Backpressure: if Ollama unavailable, respond with `error` and keep server alive.

## Error Handling (UI copy)
| Error | User Experience |
|-------|-----------------|
| Cannot reach Ollama | "Cannot connect to drawing engine. Is Ollama running?" |
| Start chunk timeout | "Drawing took too long to start. Try again." |
| Idle stream timeout | "Drawing stalled. Try a simpler prompt." |
| Invalid SVG | Keep last valid render; show "Drawing incomplete" |
| WebSocket disconnect | "Reconnecting…" with exponential backoff |

## File Structure
```
good-drawer/
├── SPEC.md
├── pyproject.toml
├── server.py
├── llm.py
├── static/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── README.md
```

## Running Locally
```bash
# Terminal 1: start Ollama
ollama serve

# Terminal 2: start backend
uv run uvicorn server:app --reload --port 8000

# Browser
open http://localhost:8000
```

## QA Scenarios
1. Basic draw: prompt "a tree" → first chunk ≤500ms, progressive render, no console errors.
2. Interruption: start "a house", type "a boat" mid-stream → house stops within 100ms, boat starts fresh.
3. Rapid typing: quick edits do not spam requests (only last debounced prompt sent).
4. Empty input: clearing text sends nothing and canvas clears.
5. Long prompt (500+ chars): rejected with inline error, no request emitted.
6. Invalid SVG recovery: simulate malformed chunk → last valid SVG persists, error message appears and clears.
7. Reconnection: stop server mid-stream → UI shows reconnecting, resumes once server returns.
8. Mobile: on phone-sized viewport, canvas and input remain usable, no horizontal scroll.

## Success Criteria
- [ ] First chunk appears within 500ms of request (measured; P95).
- [ ] Cancellation takes effect within 100ms of new input.
- [ ] Progressive SVG updates without flicker; buffer capped to avoid memory blowups.
- [ ] No console errors or unhandled promise rejections during normal use.
- [ ] Works offline with local Ollama; handles server restarts gracefully.
- [ ] Mobile-friendly layout and controls.
- [ ] Experience feels immediate and "magical" to non-technical users.
