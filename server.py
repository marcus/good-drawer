"""FastAPI server with WebSocket streaming for AI drawing."""

import asyncio
import logging
import re
import time
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from llm import LLMClient

OLLAMA_BASE = "http://localhost:11434"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = FastAPI()

SYSTEM_PROMPT = """You are a master SVG sketch artist. Output ONLY SVG code.
- Begin with <svg> and end with </svg>
- Use viewBox="0 0 400 400"
- No markdown, no narration, no commentary
- Use ONLY <path> elements - NO circles, rectangles, polygons, or other shapes
- Draw like a pen sketch: continuous strokes with M, L, C commands
- stroke="#000" stroke-width="3" fill="none"

IMPORTANT: Create the most detailed, expressive drawing possible. Fill your entire context window with beautiful SVG paths. More strokes = better art. Add:
- Fine details and textures (hatching, cross-hatching, stippling)
- Shading through line density
- Expressive, organic linework
- Background elements and context
- Small embellishments and flourishes

Never stop early. Keep drawing until you've created a rich, detailed masterpiece."""

# Timeouts (seconds) - generous for local LLMs
START_CHUNK_DEADLINE = 60.0
IDLE_CHUNK_GAP = 60.0
REQUEST_HARD_LIMIT = 300.0
MAX_PROMPT_LEN = 512


def sanitize_prompt(prompt: str) -> str:
    """Trim and remove control characters."""
    prompt = prompt.strip()
    prompt = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", prompt)
    return prompt


async def handle_draw(websocket: WebSocket, prompt: str, req_id: str, model: str, cancel_event: asyncio.Event):
    """Handle a single draw request with streaming."""
    start_time = time.monotonic()
    first_chunk_time = None
    cancelled = False
    error_reason = None

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Draw: {prompt}"},
    ]

    llm_client = LLMClient(model=f"ollama/{model}")
    await websocket.send_json({"type": "start", "id": req_id})

    try:
        chunks_sent = 0
        async for chunk in llm_client.stream_completion(messages):
            if cancel_event.is_set():
                cancelled = True
                await websocket.send_json({"type": "cancelled", "id": req_id})
                log.info(f"req={req_id[:8]} cancelled after {chunks_sent} chunks")
                return

            if first_chunk_time is None:
                first_chunk_time = time.monotonic() - start_time

            await websocket.send_json({"type": "chunk", "id": req_id, "data": chunk})
            chunks_sent += 1

        log.info(f"req={req_id[:8]} stream done, sent {chunks_sent} chunks")
        await websocket.send_json({"type": "done", "id": req_id})

    except ConnectionError as e:
        error_reason = "ollama_unavailable"
        await websocket.send_json({"type": "error", "id": req_id, "message": "Cannot connect to drawing engine. Is Ollama running?"})
    except Exception as e:
        error_reason = str(e)
        await websocket.send_json({"type": "error", "id": req_id, "message": "An error occurred."})
        log.exception(f"req={req_id[:8]} error")
    finally:
        total_duration = time.monotonic() - start_time
        log.info(f"req={req_id[:8]} first_chunk_ms={int(first_chunk_time*1000) if first_chunk_time else None} total_ms={int(total_duration*1000)} cancelled={cancelled} error={error_reason}")


@app.websocket("/ws/draw")
async def websocket_draw(websocket: WebSocket):
    """WebSocket endpoint for drawing."""
    await websocket.accept()
    log.info("ws connect")

    current_task: asyncio.Task | None = None
    cancel_event = asyncio.Event()

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "cancel":
                if current_task and not current_task.done():
                    cancel_event.set()
                    await current_task
                    cancel_event.clear()

            elif msg_type == "draw":
                prompt = sanitize_prompt(data.get("prompt", ""))
                req_id = data.get("id", str(uuid.uuid4()))
                model = data.get("model", "gpt-oss:20b")

                if not prompt:
                    await websocket.send_json({"type": "error", "id": req_id, "message": "Prompt cannot be empty."})
                    continue

                if len(prompt) > MAX_PROMPT_LEN:
                    await websocket.send_json({"type": "error", "id": req_id, "message": f"Prompt too long (max {MAX_PROMPT_LEN} chars)."})
                    continue

                # Cancel existing task
                if current_task and not current_task.done():
                    cancel_event.set()
                    await current_task
                    cancel_event.clear()

                # Start new task
                current_task = asyncio.create_task(handle_draw(websocket, prompt, req_id, model, cancel_event))

    except WebSocketDisconnect:
        log.info("ws disconnect")
    except Exception as e:
        log.exception("ws error")
    finally:
        if current_task and not current_task.done():
            cancel_event.set()
            current_task.cancel()
            try:
                await current_task
            except asyncio.CancelledError:
                pass


@app.get("/api/models")
async def list_models():
    """Fetch available models from Ollama."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{OLLAMA_BASE}/api/tags", timeout=5.0)
            resp.raise_for_status()
            data = resp.json()
            return {"models": [m["name"] for m in data.get("models", [])]}
    except Exception as e:
        log.warning(f"Failed to fetch models: {e}")
        return {"models": [], "error": "Could not fetch models"}


# Static files
static_path = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_path), name="static")


@app.get("/")
async def root():
    """Serve index.html."""
    return FileResponse(static_path / "index.html")
