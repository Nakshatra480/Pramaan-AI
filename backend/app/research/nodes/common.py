from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from langchain_core.runnables import RunnableConfig

from app.core.logging import log
from app.research.deps import ResearchDeps
from app.research.state import ResearchState

logger = logging.getLogger("pramaan.research")

NodeFn = Callable[[ResearchState, ResearchDeps], Awaitable[dict[str, Any]]]


def deps_of(config: RunnableConfig) -> ResearchDeps:
    return config["configurable"]["deps"]  # type: ignore[no-any-return]


def node(name: str) -> Callable[[NodeFn], Any]:
    """Wraps a node: injects deps and records timing/status (never inputs or outputs)."""

    def wrap(fn: NodeFn) -> Any:
        async def run(state: ResearchState, config: RunnableConfig) -> dict[str, Any]:
            start = time.perf_counter()
            status = "ok"
            try:
                return await fn(state, deps_of(config))
            except Exception as e:
                status = type(e).__name__
                raise
            finally:
                log(logger, logging.INFO, "research_node", node=name, status=status, duration_ms=round((time.perf_counter() - start) * 1000))

        # No functools.wraps: LangGraph inspects this signature to decide whether to pass `config`.
        run.__name__ = run.__qualname__ = fn.__name__
        return run

    return wrap
