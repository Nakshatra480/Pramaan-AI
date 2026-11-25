"""LangGraph research workflow (PRD §14–15).

START → query_understanding → planner → (web ∥ wikipedia ∥ academic ∥ knowledge) → evidence
      → claims → verification → synthesis → citations → END
"""

from __future__ import annotations

from functools import lru_cache

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.research.nodes.academic_research import academic_research
from app.research.nodes.citations import citations
from app.research.nodes.claims import claims
from app.research.nodes.evidence import evidence
from app.research.nodes.knowledge_retrieval import knowledge_retrieval
from app.research.nodes.planner import planner
from app.research.nodes.query_understanding import query_understanding
from app.research.nodes.synthesis import synthesis
from app.research.nodes.verification import verification
from app.research.nodes.web_research import web_research
from app.research.nodes.wikipedia_research import wikipedia_research
from app.research.state import ResearchState


@lru_cache
def build_graph() -> CompiledStateGraph:  # type: ignore[type-arg]
    g = StateGraph(ResearchState)
    g.add_node("query_understanding", query_understanding)
    g.add_node("planner", planner)
    g.add_node("web_research", web_research)
    g.add_node("wikipedia_research", wikipedia_research)
    g.add_node("academic_research", academic_research)
    g.add_node("knowledge_retrieval", knowledge_retrieval)
    g.add_node("evidence", evidence)
    g.add_node("claims", claims)
    g.add_node("verification", verification)
    g.add_node("synthesis", synthesis)
    g.add_node("citations", citations)

    g.add_edge(START, "query_understanding")
    g.add_edge("query_understanding", "planner")
    branches = ("web_research", "wikipedia_research", "academic_research", "knowledge_retrieval")
    for branch in branches:
        g.add_edge("planner", branch)
    g.add_edge(list(branches), "evidence")
    g.add_edge("evidence", "claims")
    g.add_edge("claims", "verification")
    g.add_edge("verification", "synthesis")
    g.add_edge("synthesis", "citations")
    g.add_edge("citations", END)
    return g.compile()
