import type { Collection, LibraryDocument } from "@/types";

type Seed = Omit<LibraryDocument, "content" | "collectionIds" | "projectIds"> & {
  content?: LibraryDocument["content"];
  collectionIds?: string[];
  projectIds?: string[];
};

function doc(seed: Seed): LibraryDocument {
  return {
    collectionIds: [],
    projectIds: [],
    ...seed,
    content: seed.content ?? [
      { heading: "Overview", paragraphs: [seed.summary] },
      {
        heading: "Indexed content",
        paragraphs: [
          `This document has been split into ${seed.chunks ?? 0} passages and embedded for semantic retrieval. Pramaan cites the exact passage used when this document supports a claim.`,
        ],
      },
    ],
  };
}

export const DOCUMENTS: LibraryDocument[] = [
  doc({
    id: "d1",
    title: "Retrieval-Augmented Generation for Large Language Models: A Survey",
    filename: "RAG Survey.pdf",
    kind: "paper",
    sizeBytes: 2_840_000,
    author: "Y. Gao, Y. Xiong, X. Gao, et al.",
    source: "arXiv",
    publishedAt: "2025-03-27",
    addedAt: "2026-06-02T10:12:00Z",
    status: "ready",
    pages: 26,
    chunks: 184,
    collectionIds: ["col-retrieval"],
    projectIds: ["p-ai-research"],
    summary:
      "A comprehensive survey of retrieval-augmented generation covering naive, advanced and modular RAG, retrieval granularity, augmentation strategies and evaluation.",
    content: [
      {
        heading: "Abstract",
        paragraphs: [
          "Large language models demonstrate impressive capabilities but encounter challenges such as hallucination, outdated knowledge, and non-transparent, untraceable reasoning. Retrieval-augmented generation has emerged as a promising solution by incorporating knowledge from external databases.",
          "This survey reviews the progression of RAG paradigms, encompassing naive RAG, advanced RAG and modular RAG, and scrutinises the tripartite foundation of RAG frameworks: retrieval, generation and augmentation.",
        ],
      },
      {
        heading: "1. Introduction",
        paragraphs: [
          "Retrieval enhances the accuracy and credibility of generation, particularly for knowledge-intensive tasks, and allows for continuous knowledge updates and integration of domain-specific information.",
          "Hybrid retrieval pipelines consistently outperform pure dense retrieval on knowledge-intensive tasks, especially when combined with a reranking stage that reorders candidates by relevance to the query.",
        ],
      },
      {
        heading: "2. Retrieval granularity",
        paragraphs: [
          "Retrieval units range from tokens and phrases to sentences, propositions, chunks and whole documents. Coarser units supply more context but introduce redundant information; finer units improve precision but may lose semantic completeness.",
          "Proposition-level retrieval — splitting text into atomic, self-contained factual statements — has shown gains for fact verification tasks where claims must be matched to precise evidence.",
        ],
      },
      {
        heading: "3. Evaluation",
        paragraphs: [
          "Evaluation focuses on context relevance, answer faithfulness and answer relevance. Faithfulness — whether generated statements are supported by retrieved context — is the most direct measure of hallucination.",
        ],
      },
    ],
  }),
  doc({ id: "d2", title: "Attention Is All You Need", filename: "attention-is-all-you-need.pdf", kind: "paper", sizeBytes: 2_215_000, author: "A. Vaswani et al.", source: "NeurIPS", publishedAt: "2017-06-12", addedAt: "2026-05-04T09:00:00Z", status: "ready", pages: 15, chunks: 96, collectionIds: ["col-foundations"], projectIds: ["p-ai-research"], summary: "Introduces the Transformer architecture based solely on attention mechanisms, dispensing with recurrence and convolutions." }),
  doc({ id: "d3", title: "Vision-Language-Action Models: A Survey", filename: "Vision-language-action models survey.pdf", kind: "pdf", sizeBytes: 5_420_000, author: "Robotics Lab Reading Group", source: "Uploaded", publishedAt: "2026-08-30", addedAt: "2026-09-23T16:20:00Z", status: "ready", pages: 41, chunks: 212, collectionIds: ["col-robotics"], projectIds: ["p-ai-research"], summary: "Survey of VLA architectures, training data mixtures and evaluation protocols for mobile manipulation." }),
  doc({ id: "d4", title: "Scaling Laws for Neural Language Models", filename: "scaling-laws.pdf", kind: "paper", sizeBytes: 1_730_000, author: "J. Kaplan et al.", source: "arXiv", publishedAt: "2020-01-23", addedAt: "2026-05-04T09:05:00Z", status: "ready", pages: 30, chunks: 121, collectionIds: ["col-foundations"], projectIds: ["p-ai-research"], summary: "Empirical scaling laws relating model size, dataset size and compute to cross-entropy loss." }),
  doc({ id: "d5", title: "Global EV Outlook 2026", filename: "IEA-Global-EV-Outlook-2026.pdf", kind: "pdf", sizeBytes: 12_900_000, author: "International Energy Agency", source: "iea.org", publishedAt: "2026-05-21", addedAt: "2026-06-01T08:00:00Z", status: "ready", pages: 184, chunks: 702, collectionIds: ["col-energy"], projectIds: ["p-climate"], summary: "Annual outlook on electric vehicle sales, battery demand, supply chains and policy." }),
  doc({ id: "d6", title: "Carbon Dioxide Removal — State of the Field", filename: "state-of-cdr-2026.pdf", kind: "pdf", sizeBytes: 8_300_000, author: "State of CDR", source: "stateofcdr.org", publishedAt: "2026-06-05", addedAt: "2026-06-20T08:00:00Z", status: "ready", pages: 120, chunks: 455, collectionIds: ["col-energy"], projectIds: ["p-climate"], summary: "Assessment of carbon removal methods, deployment, costs and policy frameworks." }),
  doc({ id: "d7", title: "UPI Ecosystem Statistics — August 2026", filename: "npci-upi-stats-aug-2026.xlsx.pdf", kind: "pdf", sizeBytes: 640_000, author: "NPCI", source: "npci.org.in", publishedAt: "2026-08-31", addedAt: "2026-09-17T10:30:00Z", status: "ready", pages: 6, chunks: 22, projectIds: ["p-startup"], summary: "Monthly volume and value statistics for UPI by app and bank." }),
  doc({ id: "d8", title: "Competitive landscape notes", filename: "competitive-landscape.md", kind: "markdown", sizeBytes: 18_400, author: "Aarav Mehta", source: "Note", publishedAt: "2026-09-02", addedAt: "2026-09-02T21:14:00Z", status: "ready", chunks: 9, projectIds: ["p-startup"], summary: "Working notes on merchant payment competitors, pricing and distribution." }),
  doc({ id: "d9", title: "Lab notes — humanoid teleoperation dataset review", filename: "teleop-dataset-review.docx", kind: "docx", sizeBytes: 96_000, author: "Aarav Mehta", source: "Uploaded", publishedAt: "2026-07-14", addedAt: "2026-07-14T18:00:00Z", status: "ready", pages: 8, chunks: 31, collectionIds: ["col-robotics"], projectIds: ["p-ai-research"], summary: "Review of public teleoperation datasets, their size, formats and licensing." }),
  doc({ id: "d10", title: "Why We Sleep — chapter notes", filename: "why-we-sleep-notes.txt", kind: "txt", sizeBytes: 22_000, author: "Aarav Mehta", source: "Note", addedAt: "2026-08-22T20:00:00Z", status: "ready", chunks: 12, projectIds: ["p-college"], summary: "Chapter-by-chapter notes on sleep stages and memory." }),
  doc({ id: "d11", title: "Memory & Learning — Lecture 6", filename: "Memory & Learning — Lecture 6.pdf", kind: "pdf", sizeBytes: 3_100_000, author: "Dept. of Cognitive Science", source: "Course material", publishedAt: "2026-09-05", addedAt: "2026-09-07T19:12:00Z", status: "ready", pages: 38, chunks: 48, projectIds: ["p-college"], summary: "Lecture slides on encoding, consolidation and retrieval practice." }),
  doc({ id: "d12", title: "pgvector documentation", filename: "github.com/pgvector/pgvector", kind: "website", sizeBytes: 140_000, author: "pgvector contributors", source: "github.com", publishedAt: "2026-03-30", addedAt: "2026-07-03T11:00:00Z", status: "ready", chunks: 44, collectionIds: ["col-retrieval"], projectIds: ["p-ai-research"], summary: "Open-source vector similarity search for Postgres — HNSW and IVFFlat indexes, distance functions and tuning." }),
  doc({ id: "d13", title: "Solid-state battery manufacturing — webinar transcript", filename: "ssb-webinar-transcript.docx", kind: "docx", sizeBytes: 210_000, author: "Battery Industry Forum", source: "Uploaded", publishedAt: "2026-08-12", addedAt: "2026-09-21T13:00:00Z", status: "failed", error: "The file appears to be password-protected. Remove protection and try again.", projectIds: ["p-climate"], summary: "Transcript of an industry panel on pilot-line yield and electrolyte layering." }),
  doc({ id: "d14", title: "Pricing page teardown — 12 B2B tools", filename: "pricing-teardown.md", kind: "note", sizeBytes: 31_000, author: "Meera Iyer", source: "Note", publishedAt: "2026-08-28", addedAt: "2026-08-28T17:40:00Z", status: "ready", chunks: 15, projectIds: ["p-product"], summary: "Comparison of platform fees, usage metrics and tier structures across twelve B2B tools." }),
  doc({ id: "d15", title: "Neon — Hybrid search with Postgres", filename: "neon.tech/docs/hybrid-search", kind: "website", sizeBytes: 64_000, author: "Neon", source: "neon.tech", publishedAt: "2026-04-02", addedAt: "2026-09-11T09:30:00Z", status: "ready", chunks: 18, collectionIds: ["col-retrieval"], projectIds: ["p-product"], summary: "Guide to combining Postgres full-text search with pgvector similarity via reciprocal rank fusion." }),
  doc({ id: "d16", title: "Tactile sensing benchmark results", filename: "tactile-benchmarks-2026.pdf", kind: "paper", sizeBytes: 4_050_000, author: "H. Zhou et al.", source: "Science Robotics", publishedAt: "2026-05-08", addedAt: "2026-09-26T08:40:00Z", status: "embedding", progress: 0.62, pages: 19, collectionIds: ["col-robotics"], summary: "Benchmarks for tactile foundation models on in-hand reorientation." }),
];

export const COLLECTIONS: Collection[] = [
  { id: "col-retrieval", name: "Retrieval systems", description: "RAG, hybrid search and vector indexing.", documentIds: ["d1", "d12", "d15"] },
  { id: "col-foundations", name: "Foundational papers", description: "Papers worth re-reading.", documentIds: ["d2", "d4"] },
  { id: "col-robotics", name: "Robotics", description: "Humanoids, manipulation and tactile sensing.", documentIds: ["d3", "d9", "d16"] },
  { id: "col-energy", name: "Energy & climate", description: "Storage and carbon removal reports.", documentIds: ["d5", "d6"] },
];
