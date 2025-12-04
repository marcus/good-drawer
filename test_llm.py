"""Test LLM streaming directly."""
import asyncio
from llm import llm_client

async def test():
    messages = [
        {"role": "system", "content": "You are an SVG artist. Output ONLY SVG code."},
        {"role": "user", "content": "Draw: a simple circle"},
    ]

    print("Starting stream...")
    count = 0
    async for chunk in llm_client.stream_completion(messages):
        count += 1
        print(f"Chunk {count}: {repr(chunk)}")

    print(f"Done. Total chunks: {count}")

if __name__ == "__main__":
    asyncio.run(test())
