import type { ActivityItem, Project } from "@/types";

export const CURRENT_USER_ID = "u-me";

export const DEFAULT_INSTRUCTIONS = `You are assisting with academic AI/ML research.

Prefer peer-reviewed research papers.

Prioritize recent research unless older foundational work is relevant.

Clearly distinguish established findings from emerging research.

Always provide citations for factual claims.`;

const me = { userId: CURRENT_USER_ID, name: "Aarav Mehta", role: "owner" as const, initials: "AM" };

export const PROJECTS: Project[] = [
  {
    id: "p-ai-research",
    name: "AI Research",
    description: "Literature and technical landscape for applied ML, robotics and retrieval systems.",
    icon: "sparkle",
    ownerId: CURRENT_USER_ID,
    ownerName: "Aarav Mehta",
    members: [me, { userId: "u-2", name: "Meera Iyer", role: "editor", initials: "MI" }],
    createdAt: "2026-05-02T10:00:00Z",
    updatedAt: "2026-09-25T18:44:00Z",
    researchCount: 3,
    documentIds: ["d1", "d2", "d3", "d4", "d9", "d12"],
    instructions: DEFAULT_INSTRUCTIONS,
    visibility: "private",
  },
  {
    id: "p-startup",
    name: "Startup Research",
    description: "Market sizing, competitors and payments infrastructure for the fintech thesis.",
    icon: "compass",
    ownerId: CURRENT_USER_ID,
    ownerName: "Aarav Mehta",
    members: [me],
    createdAt: "2026-06-11T09:00:00Z",
    updatedAt: "2026-09-18T11:31:00Z",
    researchCount: 1,
    documentIds: ["d7", "d8"],
    instructions:
      "Focus on the Indian and Southeast Asian markets.\n\nPrefer primary data from regulators and industry bodies over press coverage.\n\nFlag any figures older than 18 months.",
    visibility: "private",
  },
  {
    id: "p-college",
    name: "College Research",
    description: "Cognitive science coursework — sleep, memory and learning strategies.",
    icon: "book",
    ownerId: CURRENT_USER_ID,
    ownerName: "Aarav Mehta",
    members: [me],
    createdAt: "2026-08-20T15:00:00Z",
    updatedAt: "2026-09-08T08:21:00Z",
    researchCount: 1,
    documentIds: ["d10", "d11"],
    instructions: "Use APA citation style.\n\nExplain technical terms for an undergraduate audience.",
    visibility: "private",
  },
  {
    id: "p-climate",
    name: "Climate Research",
    description: "Energy storage and carbon removal: technology readiness, cost curves and policy.",
    icon: "leaf",
    ownerId: "u-3",
    ownerName: "Kabir Rao",
    members: [
      { userId: "u-3", name: "Kabir Rao", role: "owner", initials: "KR" },
      { ...me, role: "editor" },
      { userId: "u-4", name: "Sofia Lindgren", role: "viewer", initials: "SL" },
    ],
    createdAt: "2026-03-14T12:00:00Z",
    updatedAt: "2026-09-22T14:07:00Z",
    researchCount: 3,
    documentIds: ["d5", "d6", "d13"],
    instructions:
      "Prioritise IEA, IPCC and peer-reviewed sources.\n\nAlways state the year a cost estimate refers to.\n\nSeparate announced timelines from independent forecasts.",
    visibility: "link",
  },
  {
    id: "p-product",
    name: "Product Research",
    description: "Infrastructure and pricing decisions for the next platform release.",
    icon: "cpu",
    ownerId: "u-2",
    ownerName: "Meera Iyer",
    members: [
      { userId: "u-2", name: "Meera Iyer", role: "owner", initials: "MI" },
      { ...me, role: "editor" },
    ],
    createdAt: "2026-07-01T08:00:00Z",
    updatedAt: "2026-09-12T10:02:00Z",
    researchCount: 2,
    documentIds: ["d14", "d15"],
    instructions: "Favour official documentation and reproducible benchmarks.\n\nSummarise trade-offs as a short decision table.",
    visibility: "private",
  },
];

export const ACTIVITY: ActivityItem[] = [
  { id: "a1", projectId: "p-ai-research", kind: "research_completed", actor: "You", title: "The latest developments in humanoid robotics", detail: "18 sources · 14 verified claims", href: "/research/r-humanoid-robotics", createdAt: "2026-09-25T18:44:00Z" },
  { id: "a2", projectId: "p-ai-research", kind: "research_shared", actor: "You", title: "Shared “The latest developments in humanoid robotics”", detail: "Anyone with the link", createdAt: "2026-09-25T18:50:00Z" },
  { id: "a3", projectId: "p-ai-research", kind: "research_completed", actor: "You", title: "RAG versus long-context models", detail: "22 sources · 12 verified claims", href: "/research/r-rag-vs-long-context", createdAt: "2026-09-24T09:16:00Z" },
  { id: "a4", projectId: "p-ai-research", kind: "document_added", actor: "Meera Iyer", title: "Added “Vision-language-action models survey.pdf”", detail: "Indexed · 212 chunks", href: "/library/d3", createdAt: "2026-09-23T16:20:00Z" },
  { id: "a5", projectId: "p-climate", kind: "research_completed", actor: "You", title: "When will solid-state batteries reach mass production?", detail: "26 sources · 15 verified claims", href: "/research/r-solid-state-batteries", createdAt: "2026-09-22T14:07:00Z" },
  { id: "a6", projectId: "p-ai-research", kind: "instructions_updated", actor: "You", title: "Updated project instructions", detail: "Prefer peer-reviewed research papers.", createdAt: "2026-09-21T10:05:00Z" },
  { id: "a7", projectId: "p-climate", kind: "member_joined", actor: "Sofia Lindgren", title: "Joined as viewer", createdAt: "2026-09-19T09:00:00Z" },
  { id: "a8", projectId: "p-startup", kind: "research_completed", actor: "You", title: "How UPI changed digital payments in India", detail: "16 sources · 9 verified claims", href: "/research/r-upi-payments", createdAt: "2026-09-18T11:31:00Z" },
  { id: "a9", projectId: "p-climate", kind: "research_completed", actor: "Kabir Rao", title: "How effective is direct air capture?", detail: "17 sources · 9 verified claims", href: "/research/r-direct-air-capture", createdAt: "2026-09-15T16:49:00Z" },
  { id: "a10", projectId: "p-product", kind: "research_completed", actor: "Meera Iyer", title: "Is pgvector enough at production scale?", detail: "9 sources · 5 verified claims", href: "/research/r-pgvector-scale", createdAt: "2026-09-12T10:02:00Z" },
  { id: "a11", projectId: "p-college", kind: "document_added", actor: "You", title: "Added “Memory & Learning — Lecture 6.pdf”", detail: "Indexed · 48 chunks", href: "/library/d11", createdAt: "2026-09-07T19:12:00Z" },
  { id: "a12", projectId: "p-college", kind: "project_created", actor: "You", title: "Created College Research", createdAt: "2026-08-20T15:00:00Z" },
];
