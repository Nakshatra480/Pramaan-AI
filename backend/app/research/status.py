"""Research state machine and user-facing step definitions (PRD §26).

Steps describe operational progress only — never model reasoning.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.db.models import ResearchStatus as S


@dataclass(frozen=True)
class StepDef:
    key: str
    label: str
    status: S
    event: str


STEPS: list[StepDef] = [
    StepDef("understanding", "Understanding question", S.planning, "research.started"),
    StepDef("planning", "Planning research", S.planning, "research.planning"),
    StepDef("searching", "Searching sources", S.searching, "research.searching"),
    StepDef("reading", "Reading evidence", S.extracting, "research.reading"),
    StepDef("retrieving", "Retrieving knowledge", S.retrieving, "research.searching"),
    StepDef("cross_checking", "Cross-checking claims", S.verifying, "research.verifying"),
    StepDef("verifying", "Verifying evidence", S.verifying, "research.verifying"),
    StepDef("synthesizing", "Synthesizing answer", S.synthesizing, "research.synthesizing"),
    StepDef("citing", "Attaching citations", S.citing, "research.citations"),
]
STEP_BY_KEY = {s.key: s for s in STEPS}

TERMINAL = {S.completed, S.failed, S.cancelled}
ACTIVE = {S.planning, S.searching, S.retrieving, S.extracting, S.verifying, S.synthesizing, S.citing}

_ORDER = [S.queued, S.planning, S.searching, S.retrieving, S.extracting, S.verifying, S.synthesizing, S.citing, S.completed]


def can_transition(current: S, new: S) -> bool:
    """Forward-only through the pipeline; any non-terminal state may fail/cancel; failed/cancelled may be re-queued (retry)."""
    if current == new:
        return True
    if new in (S.failed, S.cancelled):
        return current not in TERMINAL
    if new == S.queued:
        return current in (S.failed, S.cancelled)
    if current in TERMINAL:
        return False
    # Retrieval runs in parallel with search, so allow any forward-or-sibling move among active states.
    return _ORDER.index(new) >= _ORDER.index(current) or {current, new} <= {S.searching, S.retrieving, S.extracting}


class ErrorCode:
    NO_SOURCES = "NO_SOURCES"
    TIMEOUT = "TIMEOUT"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"  # non-model provider failure
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    MODEL_TIMEOUT = "MODEL_TIMEOUT"
    MODEL_NOT_INSTALLED = "MODEL_NOT_INSTALLED"
    MODEL_OUT_OF_MEMORY = "MODEL_OUT_OF_MEMORY"
    INTERRUPTED = "INTERRUPTED"
    INTERNAL = "INTERNAL"
    CANCELLED = "CANCELLED"


RETRYABLE = {
    ErrorCode.NO_SOURCES,
    ErrorCode.TIMEOUT,
    ErrorCode.PROVIDER_UNAVAILABLE,
    ErrorCode.MODEL_UNAVAILABLE,
    ErrorCode.MODEL_TIMEOUT,
    ErrorCode.MODEL_NOT_INSTALLED,
    ErrorCode.MODEL_OUT_OF_MEMORY,
    ErrorCode.INTERRUPTED,
    ErrorCode.INTERNAL,
}
