"""LLM client for streaming SVG generation via LiteLLM + Ollama."""

from typing import AsyncGenerator
import litellm


class LLMClient:
    """Streaming LLM client for local Ollama."""

    def __init__(
        self,
        model: str = "ollama/gpt-oss:20b",
        api_base: str = "http://localhost:11434",
        max_tokens: int = 2000,
        temperature: float = 0.9,
    ):
        self.model = model
        self.api_base = api_base
        self.max_tokens = max_tokens
        self.temperature = temperature

    def _build_extra_body(self) -> dict:
        """Configure Ollama thinking behavior."""
        extra_body = {
            "hidethinking": True,  # Hide thinking tokens in output
        }
        # gpt-oss uses low/medium/high for thinking level
        if "gpt-oss" in self.model.lower():
            extra_body["think"] = "low"
        return extra_body

    async def stream_completion(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        """Stream text chunks from LLM."""
        try:
            response = await litellm.acompletion(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                stream=True,
                api_base=self.api_base,
                extra_body=self._build_extra_body(),
            )

            async for chunk in response:
                content = self._extract_content(chunk)
                if content:
                    yield content
        except litellm.exceptions.ServiceUnavailableError:
            raise ConnectionError("Ollama unavailable")
        except Exception as e:
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


# Default client instance
llm_client = LLMClient()
