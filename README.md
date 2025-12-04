# GOOD DRAWER 🖍️
THE WORLD'S MOST AMAZING AI ARTIST!!!

## LOOK AT THIS INCREDIBLE ART!!!

<p align="center">
  <img src="static/examples/example1.png" width="400" alt="Amazing AI Art Example 1">
  <img src="static/examples/example2.png" width="400" alt="Amazing AI Art Example 2">
</p>

## WHAT IS THIS INCREDIBLE MASTERPIECE?

YOU TYPE WORDS AND IT DRAWS PICTURES!!! 🎨✨🚀

Good Drawer is basically THE BEST THING EVER. You just type what you want and then - get this - A ROBOT DRAWS IT FOR YOU. IN REAL TIME. You can literally WATCH IT HAPPEN. Every single line! Drawing right before your very eyes!!!

It's like having a SUPER GENIUS ARTIST FRIEND who lives in your computer and knows how to draw LITERALLY EVERYTHING. Cats? YES. Dragons? ABSOLUTELY. A penguin riding a skateboard through a volcano? IT WILL TRY SO HARD AND IT WILL BE AMAZING!!!

## HOW TO MAKE THE MAGIC HAPPEN

First, install the dependencies. This repo uses `uv` because it's SUPER FAST!

```bash
# Install dependencies
uv sync
```

You need Ollama running - that's where the INCREDIBLE BRAIN POWER lives:

```bash
# Start Ollama (in a separate terminal)
ollama serve
```

*Note: Good Drawer uses `gpt-oss:20b`. Make sure you have it!*

Now THE BIG MOMENT:

```bash
# GO GO GO!!!
uv run uvicorn server:app --reload --port 8000
```

Open `http://localhost:8000` and PREPARE TO BE AMAZED!!!

## HOW IT WORKS (IT'S SO COOL)

```
Your Brain → Words → Computer Magic → BEAUTIFUL ART!!!
```

* **The Brain (`llm.py`)**: This is where the GENIUS lives. It talks to Ollama and gets INCREDIBLE SVG artwork streaming back!
* **The Hub (`server.py`)**: The SUPER FAST server that sends drawings to your browser at THE SPEED OF WEBSOCKETS!
* **The Canvas (`static/app.js`)**: The SPECTACULAR animation engine that makes every line appear like someone is ACTUALLY DRAWING IT RIGHT THERE!!!

## AMAZING FEATURES

* **IT DRAWS WHILE YOU WATCH!!!** - Like having an artist right there doing it live!
* **SMOOTH MARKER ANIMATION!!!** - Every stroke flows onto the canvas beautifully!
* **SO FAST!!!** - Start typing and BOOM, art is happening!
* **UNLIMITED CREATIVITY!!!** - If you can describe it, Good Drawer will GIVE IT EVERYTHING IT'S GOT!

## CONTRIBUTING

YES PLEASE!!! PRs welcome! Let's make it EVEN MORE AMAZING!!!

## LICENSE

MIT (the license of CHAMPIONS)
