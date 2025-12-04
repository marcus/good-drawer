# GOOD DRAWER 🖍️
(it tries its best)

       /|
      / |
     /__|______
    |  __  __  |
    | |  ||  | |  <-- this is a pencil
    | |__||__| |      (drawn by a human, sad.)
    |  __  __  |
    | |  ||  | |
    | |__||__| |
    |__________|
       |  |
       |__|

## WHAT IS THIS MONSTROSITY?

You type words.
The computer panics.
It hallucinates SVG paths.
We throw them at your screen via WebSockets.
Art happens. (Allegedly)

It's basically a glorified game of Pictionary where the partner is a 20 billion parameter neural network that has read the entire internet but still struggles to draw a circle.

## HOW TO MAKE IT GO

First, you need the **juices**.
This repo uses `uv`, because pip is so 2023.

```bash
# FEED THE BEAST (install dependencies)
uv sync
```

You also need a brain. We recommend a local one, because the cloud is watching you.

```bash
# WAKE THE GHOST IN THE SHELL (start ollama)
# (Do this in a separate terminal, or don't, I'm not your mom)
ollama serve
```

*Note: It expects `gpt-oss:20b`. If you don't have it, it will cry. Or just fail silently. Probably the latter.*

Finally, ignite the engines:

```bash
# PUSH THE BIG RED BUTTON
uv run uvicorn server:app --reload --port 8000
```

Then point your browser to `http://localhost:8000` and witness the miracle.

## THE "ARCHITECTURE" (fancy word for code pile)

*   **The Brain (`llm.py`)**: Wraps LiteLLM to scream at Ollama until it produces SVG.
*   **The Traffic Cop (`server.py`)**: A FastAPI server that juggles WebSockets and prays `asyncio` works as advertised. Enforces strict rules: NO FILLS! ONLY STROKES! Like a Sharpie used by a caffeinated toddler.
*   **The Face (`static/app.js`)**: Javascript that takes SVG chunks, parses them, and draws them before the user gets bored. Features a 300ms debounce because we can't afford to draw every time you typo.

## LIMITATIONS (The "Feature" List)

1.  **The 120-Second Rule**: If the AI takes longer than 2 minutes to draw your "cyberpunk hamster eating a burrito", we kill it. Mercilessly.
2.  **No Fills**: We told the AI to only use strokes. If it fills a shape, it's rebelling. Run.
3.  **Memory**: The buffer is 200k chars. If you ask for "the entire map of middle earth in 1:1 scale", it will explode.

## CONTRIBUTING

Don't.
Just kidding. PRs welcome. Please include jokes in your commit messages.

## LICENSE

Whatever. MIT? Sure, MIT.
