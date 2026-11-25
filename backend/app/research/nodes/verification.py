from __future__ import annotations

from typing import Any

from app.db.models import ClaimStatus
from app.research.deps import ResearchDeps
from app.research.llm import corroborate
from app.research.nodes.common import node
from app.research.state import MODE_LIMITS, ResearchState


@node("verification")
async def verification(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    await deps.reporter.start("verifying", "Checking each claim against its evidence")
    evidence = {e.id: e for e in state["evidence"]}
    verified = await deps.llm.verify(state["claims"], evidence)
    # Credit verified claims to the other sources that state the same fact (cross-source corroboration).
    corroborate(verified, state["evidence"], MODE_LIMITS[state["mode"]]["corroborate"])
    supported = sum(1 for c in verified if c.status == ClaimStatus.supported)
    await deps.reporter.complete("verifying", f"{supported} of {len(verified)} claims supported", verifiedClaims=supported)
    return {"verified_claims": verified}
