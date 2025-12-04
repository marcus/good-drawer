"""LLM client for streaming SVG generation via LiteLLM + Ollama."""

import asyncio
from typing import AsyncGenerator
import litellm


class LLMClient:
    """Streaming LLM client for local Ollama."""

    def __init__(self, model: str = "ollama/gpt-oss:20b", max_tokens: int = 800, temperature: float = 0.9):
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature

    async def stream_completion(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        """Stream text chunks from LLM."""
        try:
            response = await litellm.acompletion(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                stream=True,
            )
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except litellm.exceptions.ServiceUnavailableError:
            raise ConnectionError("Ollama unavailable")
        except Exception as e:
            raise ConnectionError(f"LLM error: {e}")


# Default client instance
llm_client = LLMClient()
