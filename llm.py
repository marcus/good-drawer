"""LLM client for streaming SVG generation via LiteLLM."""

import logging
from typing import AsyncGenerator
import litellm

log = logging.getLogger(__name__)


class LLMClient:
    """Streaming LLM client supporting Ollama and OpenRouter."""

    def __init__(
        self,
        model: str = "gpt-oss:20b",
        provider: str = "ollama",
        api_base: str = "http://localhost:11434",
        max_tokens: int = 100000,
        temperature: float = 0.9,
    ):
        self.provider = provider
        self.model = f"{provider}/{model}"
        self.api_base = api_base if provider == "ollama" else None
        self.max_tokens = max_tokens
        self.temperature = temperature

    def _build_extra_body(self) -> dict | None:
        """Configure provider-specific options."""
        if self.provider != "ollama":
            return None
        extra_body = {"hidethinking": True}
        if "gpt-oss" in self.model.lower():
            extra_body["think"] = "low"
        return extra_body

    async def stream_completion(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        """Stream text chunks from LLM."""
        try:
            kwargs = {
                "model": self.model,
                "messages": messages,
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "stream": True,
            }
            if self.api_base:
                kwargs["api_base"] = self.api_base
            extra_body = self._build_extra_body()
            if extra_body:
                kwargs["extra_body"] = extra_body

            log.info(f"llm start model={self.model} max_tokens={self.max_tokens}")
            response = await litellm.acompletion(**kwargs)

            chunk_count = 0
            async for chunk in response:
                chunk_count += 1
                content = self._extract_content(chunk)
                if content:
                    yield content
                # Check for finish reason
                if hasattr(chunk, "choices") and chunk.choices:
                    finish = chunk.choices[0].finish_reason
                    if finish:
                        log.info(f"llm finish reason={finish} chunks={chunk_count}")
            log.info(f"llm stream ended chunks={chunk_count}")
        except litellm.exceptions.ServiceUnavailableError:
            raise ConnectionError(f"{self.provider} unavailable")
        except Exception as e:
            log.exception(f"llm error: {e}")
            raise ConnectionError(f"LLM error: {e}")

    def _extract_content(self, chunk) -> str:
        """Extract text from various chunk formats."""
        try:
            if hasattr(chunk, "choices") and chunk.choices:
                delta = chunk.choices[0].delta
                if hasattr(delta, "content") and delta.content:
                    return delta.content
            return ""
        except (AttributeError, KeyError, IndexError):
            return ""
