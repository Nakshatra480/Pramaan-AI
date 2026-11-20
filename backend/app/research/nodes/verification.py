from __future__ import annotations

from typing import Any

from app.db.models import ClaimStatus
from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import ResearchState


@node("verification")
async def verification(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    await deps.reporter.start("verifying", "Checking each claim against its evidence")
    evidence = {e.id: e for e in state["evidence"]}
    verified = await deps.llm.verify(state["claims"], evidence)
    supported = sum(1 for c in verified if c.status == ClaimStatus.supported)
    await deps.reporter.complete("verifying", f"{supported} of {len(verified)} claims supported", verifiedClaims=supported)
    return {"verified_claims": verified}
