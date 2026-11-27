import type { Claim, Evidence, Research, ResearchReport } from "@/types";

/**
 * Mock research sessions. Citation markers `[n]` refer to `sourceIds[n - 1]`,
 * matching the deterministic citation mapping described in PRD §25.
 */

type Seed = Omit<Research, "report" | "visibility" | "followUps" | "saved"> & {
  report?: Omit<ResearchReport, "citations">;
  saved?: boolean;
  visibility?: Research["visibility"];
  followUps?: Research["followUps"];
};

function session(seed: Seed): Research {
  return {
    saved: false,
    visibility: "private",
    followUps: [],
    ...seed,
    report: seed.report
      ? { ...seed.report, citations: seed.sourceIds.map((sourceId, i) => ({ index: i + 1, sourceId })) }
      : undefined,
  };
}

const ev = (id: string, sourceId: string, passage: string, relevance: number, location?: string): Evidence => ({
  id,
  sourceId,
  passage,
  relevance,
  location,
});

const claim = (
  id: string,
  text: string,
  status: Claim["status"],
  confidence: number,
  sourceIds: string[],
  evidenceIds: string[],
): Claim => ({ id, text, status, confidence, sourceIds, evidenceIds });

export const RESEARCH: Research[] = [
  session({
    id: "r-humanoid-robotics",
    title: "The latest developments in humanoid robotics",
    query: "What are the latest developments in humanoid robotics?",
    topic: "Robotics",
    mode: "deep",
    channels: ["web", "academic", "project"],
    projectId: "p-ai-research",
    status: "complete",
    createdAt: "2026-09-25T18:42:00Z",
    completedAt: "2026-09-25T18:44:10Z",
    saved: true,
    shareId: "sh-humanoid",
    visibility: "link",
    metrics: { sources: 18, evidence: 31, candidateClaims: 16, verifiedClaims: 14 },
    sourceIds: ["S1", "S2", "S3", "S4", "S5", "S6", "S34"],
    evidence: [
      ev("e1", "S1", "Sim-to-real transfer of learned locomotion policies is now reported as routine across the majority of surveyed platforms, with 87% achieving stable outdoor walking without task-specific tuning.", 0.94, "§3.2"),
      ev("e2", "S1", "Dexterous manipulation remains the dominant bottleneck: fewer than one in five controllers generalised to unseen object geometries.", 0.9, "§5.1"),
      ev("e3", "S2", "The strongest vision-language-action model achieved a 62% success rate on novel household objects, compared with 31% for the best task-specific baseline.", 0.91, "Table 2"),
      ev("e4", "S3", "Quasi-direct-drive actuator costs declined by approximately 40% between 2023 and 2025, driven by shared supply chains with electric vehicle motors.", 0.86, "Fig. 4"),
      ev("e5", "S4", "Tactile foundation models pretrained on 1.2 million contact events improved in-hand reorientation success from 48% to 71%.", 0.83, "Results"),
      ev("e6", "S5", "At least four automakers are now running humanoid pilots on assembly lines, though none has disclosed a full production deployment.", 0.79),
      ev("e7", "S6", "Logistics pilots report throughput at 30–50% of a trained human worker for tote handling, with uptime the most cited constraint.", 0.72, "p. 14"),
      ev("e8", "S34", "Teleoperation datasets remain small and inconsistent in format; the team identified only three public datasets exceeding 1,000 hours.", 0.7),
    ],
    claims: [
      claim("c1", "Learned locomotion now transfers reliably from simulation to real humanoid hardware.", "supported", 0.93, ["S1"], ["e1"]),
      claim("c2", "Dexterous manipulation is the main technical bottleneck for general-purpose humanoids.", "supported", 0.9, ["S1", "S4"], ["e2", "e5"]),
      claim("c3", "Vision-language-action models roughly double success rates on novel objects versus task-specific baselines.", "supported", 0.88, ["S2"], ["e3"]),
      claim("c4", "Actuator costs fell by around 40% between 2023 and 2025.", "partially_supported", 0.71, ["S3"], ["e4"]),
      claim("c5", "Humanoids are being piloted, but not yet deployed at production scale, in automotive manufacturing.", "supported", 0.84, ["S5", "S6"], ["e6", "e7"]),
      claim("c6", "Humanoid robots will be cost-competitive with human labour in logistics by 2027.", "insufficient_evidence", 0.32, ["S6"], ["e7"]),
    ],
    report: {
      summary: [
        "Humanoid robotics has moved from research demonstrations toward early commercial pilots. The clearest progress is in locomotion, where learned controllers now transfer reliably from simulation to hardware [1], and in general-purpose manipulation driven by vision-language-action models [2].",
        "Commercial activity is real but early. Several automakers and logistics operators are running pilots [5][6], helped by falling actuator costs [3], yet dexterous manipulation and reliability remain the limiting factors [1][4]. Claims about near-term cost parity with human labour are not supported by the evidence reviewed.",
      ],
      findings: [
        { title: "Locomotion is largely solved in the lab", body: "Sim-to-real transfer of learned walking policies is now routine across most surveyed platforms [1].", claimIds: ["c1"] },
        { title: "Generalist manipulation is improving quickly", body: "Vision-language-action models roughly double success on unseen objects compared with task-specific systems [2], and tactile pretraining adds further gains [4].", claimIds: ["c3"] },
        { title: "Hardware is getting cheaper", body: "Actuator costs have fallen meaningfully, partly by sharing supply chains with EV motors [3], though estimates rest on a limited teardown sample.", claimIds: ["c4"] },
        { title: "Commercial use remains experimental", body: "Pilots in automotive assembly and logistics are expanding, but none has disclosed production-scale deployment [5][6].", claimIds: ["c5"] },
      ],
      analysis: [
        {
          heading: "Perception and control",
          paragraphs: [
            "The most significant technical shift is the move from hand-engineered controllers to learned whole-body policies. A survey of 140 deployed controllers found stable outdoor walking without task-specific tuning on the large majority of platforms [1]. This has reduced the engineering effort required to bring a new platform to basic mobility.",
            "Manipulation has not kept pace. Fewer than one in five controllers generalised to unseen object geometries [1]. Two developments are narrowing the gap: vision-language-action models trained on mixed internet and robot data [2], and tactile foundation models that improve in-hand reorientation from 48% to 71% [4]. Your project notes flag a related constraint — high-quality teleoperation data remains scarce [7].",
          ],
        },
        {
          heading: "Economics and deployment",
          paragraphs: [
            "Cost reductions are coming from the drivetrain. Teardown analysis attributes an approximately 40% fall in actuator cost to shared supply chains with electric vehicles [3]. Because the sample covers eleven platforms, this should be treated as directional rather than precise.",
            "Deployment evidence points to careful experimentation. Logistics pilots report throughput at 30–50% of a trained worker for tote handling, with uptime the most frequently cited constraint [6]. Automotive pilots are expanding across at least four manufacturers, but none has announced a full production deployment [5].",
          ],
        },
      ],
      limitations: [
        "Commercial performance figures are largely self-reported by vendors and pilot operators, and methodology is rarely disclosed [5][6].",
        "Pramaan couldn't find enough reliable evidence to support forecasts of cost parity with human labour by 2027; that claim is excluded from the findings.",
        "Academic benchmarks use differing task suites, which limits direct comparison between manipulation results [2][4].",
      ],
    },
    followUps: [
      {
        id: "f1",
        question: "Which companies are furthest along with factory deployments?",
        createdAt: "2026-09-25T18:52:00Z",
        status: "complete",
        answer: [
          "Based on the sources collected, public evidence is limited to pilot announcements rather than audited deployments. Automotive manufacturers are the most active, with at least four running assembly-line pilots [5]. Logistics operators report the most detailed performance data, but at 30–50% of human throughput [6].",
          "No source reviewed confirms a production-scale deployment, so rankings beyond “piloting” versus “not piloting” would not be evidence-backed.",
        ],
      },
    ],
  }),

  session({
    id: "r-rag-vs-long-context",
    title: "RAG versus long-context models",
    query: "Compare retrieval-augmented generation with long-context language models.",
    topic: "AI / ML",
    mode: "standard",
    channels: ["web", "academic", "project"],
    projectId: "p-ai-research",
    status: "complete",
    createdAt: "2026-09-24T09:15:00Z",
    completedAt: "2026-09-24T09:16:21Z",
    saved: true,
    metrics: { sources: 22, evidence: 38, candidateClaims: 14, verifiedClaims: 12 },
    sourceIds: ["S8", "S7", "S10", "S11", "S9", "S33"],
    evidence: [
      ev("e9", "S8", "On multi-document question answering, RAG with a strong reranker matched long-context performance at 18% of the input token cost.", 0.95, "Table 3"),
      ev("e10", "S7", "Accuracy for facts placed in the middle 40% of a one-million-token context was 11 points lower than for facts near either end.", 0.93, "§4"),
      ev("e11", "S10", "Median time-to-first-token increased roughly linearly with prompt length, exceeding 20 seconds above 500k tokens on the providers tested.", 0.77),
      ev("e12", "S11", "Retrieval-augmented systems with passage-level attribution produced 34% fewer unsupported statements than unconstrained generation.", 0.88, "§5.3"),
      ev("e13", "S9", "Combining PostgreSQL full-text search with pgvector similarity using reciprocal rank fusion improved recall@10 over either method alone.", 0.74),
      ev("e14", "S33", "Hybrid retrieval pipelines consistently outperform pure dense retrieval on knowledge-intensive tasks.", 0.87, "p. 9"),
    ],
    claims: [
      claim("c7", "RAG can match long-context accuracy at a fraction of the token cost.", "supported", 0.9, ["S8"], ["e9"]),
      claim("c8", "Long-context models degrade on information placed mid-context.", "supported", 0.89, ["S7"], ["e10"]),
      claim("c9", "Latency grows with prompt length, making very long contexts slow for interactive use.", "supported", 0.81, ["S10"], ["e11"]),
      claim("c10", "Passage-level attribution reduces unsupported statements.", "supported", 0.86, ["S11"], ["e12"]),
      claim("c11", "Hybrid keyword + vector retrieval improves recall.", "partially_supported", 0.74, ["S9", "S33"], ["e13", "e14"]),
    ],
    report: {
      summary: [
        "Retrieval-augmented generation and long-context models solve overlapping problems with different trade-offs. Controlled comparisons show RAG with a good reranker can match long-context accuracy at a fraction of the cost [1], while long-context models still lose accuracy on information placed mid-context [2].",
        "For evidence-sensitive products, retrieval has an additional advantage: passage-level attribution measurably reduces unsupported statements [4]. Long context is most useful when the full corpus is small and relationships span the whole document.",
      ],
      findings: [
        { title: "Comparable accuracy, lower cost", body: "RAG matched long-context accuracy at 18% of the input token cost in a controlled benchmark [1].", claimIds: ["c7"] },
        { title: "Position still matters", body: "Facts in the middle of a million-token context were answered 11 points less accurately [2].", claimIds: ["c8"] },
        { title: "Latency scales with context", body: "Time-to-first-token exceeded 20 seconds above 500k tokens on tested providers [3].", claimIds: ["c9"] },
        { title: "Attribution improves faithfulness", body: "Retrieval with passage-level citations produced 34% fewer unsupported statements [4].", claimIds: ["c10"] },
      ],
      analysis: [
        {
          heading: "Accuracy and robustness",
          paragraphs: [
            "The strongest controlled comparison evaluated both approaches on multi-document question answering and found parity when RAG used a cross-encoder reranker [1]. Long-context models performed better on tasks requiring synthesis across an entire document, such as summarising a single long contract.",
            "Positional robustness has improved but not disappeared: a replication of the “lost in the middle” study found an 11-point gap for facts in the central portion of very long contexts [2].",
          ],
        },
        {
          heading: "Cost, latency and architecture",
          paragraphs: [
            "Cost and latency favour retrieval for interactive use. Pricing analysis shows latency rising roughly linearly with prompt length [3]. Hybrid retrieval — combining full-text search with vector similarity — improves recall over either method alone [5][6], and can run inside PostgreSQL without a separate vector database [5].",
          ],
        },
      ],
      limitations: [
        "Most benchmarks use English-language corpora; results may differ for multilingual research.",
        "Model pricing changes frequently, so cost ratios should be re-checked before making infrastructure decisions [3].",
      ],
    },
    followUps: [],
  }),

  session({
    id: "r-solid-state-batteries",
    title: "When will solid-state batteries reach mass production?",
    query: "When will solid-state batteries reach mass production in electric vehicles?",
    topic: "Energy",
    mode: "deep",
    channels: ["web", "academic"],
    projectId: "p-climate",
    status: "complete",
    createdAt: "2026-09-22T14:05:00Z",
    completedAt: "2026-09-22T14:07:40Z",
    saved: false,
    metrics: { sources: 26, evidence: 44, candidateClaims: 18, verifiedClaims: 15 },
    sourceIds: ["S12", "S13", "S14", "S15"],
    evidence: [
      ev("e15", "S12", "Sulfide electrolytes now show interfacial stability exceeding 1,000 cycles in pouch cells, but only under stack pressures above 5 MPa.", 0.92, "Fig. 2"),
      ev("e16", "S13", "The IEA does not expect solid-state cells to exceed 2% of EV battery demand before 2030.", 0.89, "Ch. 3"),
      ev("e17", "S14", "Several automakers have moved solid-state programmes to pilot lines, targeting limited-volume vehicles from 2027–2028.", 0.76),
      ev("e18", "S15", "Yield losses at the electrolyte layering step remain the largest contributor to projected cell cost.", 0.84, "§4.1"),
    ],
    claims: [
      claim("c12", "Solid-state cells will stay a small share of EV batteries before 2030.", "supported", 0.87, ["S13"], ["e16"]),
      claim("c13", "Manufacturing yield, not chemistry, is the primary barrier.", "partially_supported", 0.7, ["S15", "S12"], ["e18", "e15"]),
      claim("c14", "Limited-volume vehicles with solid-state cells are targeted for 2027–2028.", "supported", 0.8, ["S14"], ["e17"]),
      claim("c15", "Solid-state batteries will cost less than lithium-ion by 2030.", "insufficient_evidence", 0.28, [], []),
    ],
    report: {
      summary: [
        "Solid-state batteries are approaching pilot production, with automakers targeting limited-volume vehicles in 2027–2028 [3]. Mass-market adoption is further away: the IEA expects solid-state cells to remain under 2% of EV battery demand before 2030 [2].",
        "The chemistry has improved substantially [1], but manufacturing yield is now the dominant constraint on cost [4].",
      ],
      findings: [
        { title: "Pilot lines, not mass production", body: "Automaker programmes are moving to pilot lines with 2027–2028 targets for limited volumes [3].", claimIds: ["c14"] },
        { title: "Small share this decade", body: "Solid-state is projected to stay below 2% of EV battery demand before 2030 [2].", claimIds: ["c12"] },
        { title: "Yield is the bottleneck", body: "Electrolyte layering losses drive projected cost more than materials [4], though stack-pressure requirements remain a chemistry challenge [1].", claimIds: ["c13"] },
      ],
      analysis: [
        {
          heading: "Technical readiness",
          paragraphs: [
            "Recent sulfide electrolyte work demonstrates more than 1,000 cycles in pouch cells, a meaningful milestone [1]. However, these results depend on high stack pressure, which complicates pack design and adds weight.",
          ],
        },
        {
          heading: "Commercial timeline",
          paragraphs: [
            "Announcements point to limited-volume launches in 2027–2028 [3]. Independent outlooks are more conservative, projecting a very small market share through 2030 [2]. The gap between the two reflects manufacturing yield, which analyses identify as the largest contributor to projected cost [4].",
          ],
        },
      ],
      limitations: [
        "Pramaan couldn't find enough reliable evidence to support claims that solid-state batteries will be cheaper than lithium-ion by 2030.",
        "Automaker timelines are forward-looking statements and have historically slipped.",
      ],
    },
  }),

  session({
    id: "r-glp1-cardio",
    title: "GLP-1 drugs and cardiovascular outcomes",
    query: "Do GLP-1 receptor agonists reduce cardiovascular events in people without diabetes?",
    topic: "Health",
    mode: "standard",
    channels: ["academic"],
    projectId: null,
    status: "complete",
    createdAt: "2026-09-20T20:11:00Z",
    completedAt: "2026-09-20T20:12:32Z",
    saved: true,
    metrics: { sources: 14, evidence: 21, candidateClaims: 9, verifiedClaims: 8 },
    sourceIds: ["S16", "S17", "S18"],
    evidence: [
      ev("e19", "S16", "Semaglutide reduced the incidence of death from cardiovascular causes, nonfatal myocardial infarction, or nonfatal stroke by 20% compared with placebo.", 0.96, "Abstract"),
      ev("e20", "S17", "Across eight trials, GLP-1 receptor agonists were associated with a 14% relative reduction in major adverse cardiovascular events.", 0.91),
      ev("e21", "S18", "Only 32% of patients remained on therapy after 12 months in routine clinical practice.", 0.8),
    ],
    claims: [
      claim("c16", "Semaglutide reduced major cardiovascular events by about 20% in adults with obesity but without diabetes.", "supported", 0.94, ["S16"], ["e19"]),
      claim("c17", "The benefit appears to be a class effect across GLP-1 agonists.", "partially_supported", 0.66, ["S17"], ["e20"]),
      claim("c18", "Low real-world persistence may limit population-level benefit.", "supported", 0.78, ["S18"], ["e21"]),
    ],
    report: {
      format: "paper",
      title: "Cardiovascular outcomes of GLP-1 receptor agonists in adults without diabetes",
      keywords: ["GLP-1 receptor agonists", "semaglutide", "major adverse cardiovascular events", "obesity"],
      summary: [
        "This review asks whether GLP-1 receptor agonists reduce cardiovascular events in people without diabetes. In the largest randomised trial, semaglutide reduced major adverse cardiovascular events by 20% relative to placebo in adults with obesity and established cardiovascular disease [1]. Pooled trial data suggest a 14% reduction across the drug class, although the populations studied differ [2]. Low persistence in routine practice, with about a third of patients still treated at twelve months, may limit the benefit outside trials [3].",
      ],
      findings: [],
      analysis: [],
      sections: [
        {
          heading: "Introduction",
          blocks: [
            {
              type: "paragraph",
              text: "GLP-1 receptor agonists were developed for type 2 diabetes and are now prescribed widely for obesity. Whether their cardiovascular benefit extends to people without diabetes determines how broadly they should be used for prevention [1].",
            },
          ],
        },
        {
          heading: "Trial evidence in adults with obesity",
          blocks: [
            {
              type: "paragraph",
              text: "In adults with obesity and pre-existing cardiovascular disease but without diabetes, semaglutide reduced the composite of cardiovascular death, non-fatal myocardial infarction and non-fatal stroke by 20% compared with placebo [1].",
            },
            {
              type: "table",
              caption: "Reported effects of GLP-1 receptor agonists on cardiovascular outcomes",
              columns: ["Evidence", "Population", "Reported effect"],
              rows: [
                ["Randomised trial (semaglutide)", "Obesity with cardiovascular disease, no diabetes", "20% relative reduction in major adverse cardiovascular events [1]"],
                ["Meta-analysis of eight trials", "Mostly people with diabetes", "14% relative reduction across agents [2]"],
                ["Routine clinical practice", "Patients starting therapy", "32% still on therapy after 12 months [3]"],
              ],
            },
            {
              type: "paragraph",
              text: "Pooled analyses across eight trials report a 14% relative reduction across agents, which suggests a class effect, although heterogeneity between trials is substantial [2].",
            },
          ],
        },
        {
          heading: "Persistence in routine care",
          blocks: [
            {
              type: "paragraph",
              text: "Only 32% of patients remained on therapy twelve months after starting it in routine clinical practice, far fewer than in the trials [3].",
            },
            {
              type: "diagram",
              caption: "From trial efficacy to population benefit [1][3]",
              code: 'flowchart LR\n    n1["Trial efficacy<br>20% fewer events"]\n    n2["Treatment started<br>in practice"]\n    n3["32% still treated<br>after 12 months"]\n    n4["Smaller population<br>benefit"]\n    n1 --> n2\n    n2 --> n3\n    n3 --> n4',
            },
          ],
        },
        {
          heading: "Discussion",
          blocks: [
            {
              type: "paragraph",
              text: "The primary trial enrolled people with established cardiovascular disease, so its result should not be extended to primary prevention without further evidence [1]. Because the pooled analysis draws mostly on people with diabetes, the class effect remains only partially supported for this population [2].",
            },
          ],
        },
        {
          heading: "Conclusion",
          blocks: [
            {
              type: "paragraph",
              text: "For adults with obesity and cardiovascular disease but without diabetes, the best available trial shows a clinically meaningful reduction in cardiovascular events [1]; how much of it is realised in practice depends on keeping patients on treatment [3].",
            },
          ],
        },
      ],
      limitations: [
        "This is not medical advice. Findings summarise published research and should be discussed with a clinician.",
        "Pramaan found insufficient evidence on long-term outcomes beyond five years.",
      ],
    },
  }),

  session({
    id: "r-upi-payments",
    title: "How UPI changed digital payments in India",
    query: "How did UPI change digital payments and merchant adoption in India?",
    topic: "Finance",
    mode: "standard",
    channels: ["web"],
    projectId: "p-startup",
    status: "complete",
    createdAt: "2026-09-18T11:30:00Z",
    completedAt: "2026-09-18T11:31:12Z",
    saved: false,
    metrics: { sources: 16, evidence: 24, candidateClaims: 10, verifiedClaims: 9 },
    sourceIds: ["S19", "S20", "S21"],
    evidence: [
      ev("e22", "S19", "UPI processed over 20 billion transactions in August 2026.", 0.93),
      ev("e23", "S20", "Interoperable, zero-MDR design lowered acceptance costs for small merchants and accelerated inclusion among first-time digital users.", 0.88),
      ev("e24", "S21", "QR acceptance among surveyed small merchants in tier-2 and tier-3 cities rose from 38% to 81% over four years.", 0.82),
    ],
    claims: [
      claim("c19", "UPI now processes more than 20 billion transactions per month.", "supported", 0.92, ["S19"], ["e22"]),
      claim("c20", "Zero merchant discount rates drove small-merchant adoption.", "partially_supported", 0.69, ["S20", "S21"], ["e23", "e24"]),
    ],
    report: {
      summary: [
        "UPI has become India's dominant retail payments rail, processing more than 20 billion transactions per month [1]. Its interoperable, zero-fee design lowered acceptance costs for small merchants [2], and QR acceptance in smaller cities more than doubled over four years [3].",
      ],
      findings: [
        { title: "Scale", body: "Monthly volume exceeds 20 billion transactions [1].", claimIds: ["c19"] },
        { title: "Merchant economics", body: "Zero-MDR pricing reduced acceptance costs, though causality is hard to isolate [2][3].", claimIds: ["c20"] },
      ],
      analysis: [
        {
          heading: "Why adoption accelerated",
          paragraphs: [
            "Public infrastructure design choices — interoperability across banks and apps, and a zero merchant discount rate — are consistently cited as the key enablers [2]. Survey evidence from smaller cities shows the shift reached beyond metro areas [3].",
          ],
        },
      ],
      limitations: ["Revenue sustainability for payment apps under zero-MDR is debated and not resolved by the sources reviewed."],
    },
  }),

  session({
    id: "r-direct-air-capture",
    title: "How effective is direct air capture?",
    query: "How cost-effective is direct air capture compared with other carbon removal methods?",
    topic: "Climate",
    mode: "standard",
    channels: ["web", "academic"],
    projectId: "p-climate",
    status: "complete",
    createdAt: "2026-09-15T16:48:00Z",
    completedAt: "2026-09-15T16:49:30Z",
    metrics: { sources: 17, evidence: 26, candidateClaims: 11, verifiedClaims: 9 },
    sourceIds: ["S22", "S23", "S24"],
    evidence: [
      ev("e25", "S22", "Current DAC costs are estimated at $400–1,000 per tonne of CO₂, with plausible pathways to $150–300 by 2040.", 0.9),
      ev("e26", "S23", "Novel CDR methods, including DAC, removed around 0.002 GtCO₂ per year — a tiny fraction of conventional removals.", 0.87),
      ev("e27", "S24", "The facility captured less than half of its nameplate capacity in its first year of operation.", 0.71),
    ],
    claims: [
      claim("c21", "DAC currently costs $400–1,000 per tonne.", "supported", 0.86, ["S22"], ["e25"]),
      claim("c22", "Deployed DAC capacity remains negligible at a global scale.", "supported", 0.88, ["S23"], ["e26"]),
      claim("c23", "Early DAC facilities underperform nameplate capacity.", "partially_supported", 0.62, ["S24"], ["e27"]),
    ],
    report: {
      summary: [
        "Direct air capture remains expensive — roughly $400–1,000 per tonne today [1] — and deployed capacity is negligible relative to conventional carbon removal [2]. Early facilities have also reported output below nameplate capacity [3].",
      ],
      findings: [
        { title: "High but falling cost", body: "Techno-economic pathways reach $150–300 per tonne by 2040 [1].", claimIds: ["c21"] },
        { title: "Tiny current scale", body: "Novel CDR removes around 0.002 GtCO₂ per year [2].", claimIds: ["c22"] },
      ],
      analysis: [
        {
          heading: "Comparison with other methods",
          paragraphs: [
            "Nature-based removal remains far cheaper per tonne but faces durability questions [2]. DAC's advantage is permanence and measurability, which is why it attracts long-term purchase agreements despite cost [1].",
          ],
        },
      ],
      limitations: ["Facility-level performance data comes from a single press report and is not independently verified [3]."],
    },
  }),

  session({
    id: "r-pgvector-scale",
    title: "Is pgvector enough at production scale?",
    query: "Can pgvector with HNSW handle production-scale semantic search, or do we need a dedicated vector database?",
    topic: "Engineering",
    mode: "quick",
    channels: ["web"],
    projectId: "p-product",
    status: "complete",
    createdAt: "2026-09-12T10:02:00Z",
    completedAt: "2026-09-12T10:02:41Z",
    metrics: { sources: 9, evidence: 14, candidateClaims: 6, verifiedClaims: 5 },
    sourceIds: ["S25", "S26", "S9"],
    evidence: [
      ev("e28", "S25", "HNSW indexes provide better query performance than IVFFlat with a better speed–recall trade-off, at the cost of slower builds and more memory.", 0.9),
      ev("e29", "S26", "At 0.95 recall, graph-based indexes deliver the highest throughput across the evaluated datasets.", 0.83),
    ],
    claims: [
      claim("c24", "HNSW in pgvector offers a strong speed–recall trade-off for most workloads.", "supported", 0.85, ["S25", "S26"], ["e28", "e29"]),
      claim("c25", "A dedicated vector database is unnecessary below ~50M vectors.", "insufficient_evidence", 0.35, [], []),
    ],
    report: {
      summary: [
        "For most product workloads, pgvector with HNSW indexing offers a strong speed–recall trade-off [1][2] and keeps vectors next to relational data, enabling hybrid search in a single query [3]. Pramaan found insufficient evidence for a specific scale threshold at which a dedicated vector database becomes necessary.",
      ],
      findings: [
        { title: "HNSW is the right default", body: "It outperforms IVFFlat on query speed at the cost of memory and build time [1].", claimIds: ["c24"] },
        { title: "Hybrid search in one place", body: "Full-text and vector search can be fused inside PostgreSQL [3].", claimIds: [] },
      ],
      analysis: [
        { heading: "Recommendation", paragraphs: ["Start with pgvector and HNSW, monitor recall and p95 latency, and revisit only if memory pressure or write throughput become constraints [1][2]."] },
      ],
      limitations: ["Benchmarks vary by hardware and embedding dimension; test with your own data before committing."],
    },
  }),

  session({
    id: "r-sleep-memory",
    title: "Sleep and memory consolidation in students",
    query: "How does sleep affect memory consolidation and exam performance in university students?",
    topic: "Science",
    mode: "standard",
    channels: ["academic"],
    projectId: "p-college",
    status: "complete",
    createdAt: "2026-09-08T08:20:00Z",
    completedAt: "2026-09-08T08:21:15Z",
    saved: true,
    metrics: { sources: 12, evidence: 19, candidateClaims: 8, verifiedClaims: 7 },
    sourceIds: ["S27", "S28"],
    evidence: [
      ev("e30", "S27", "Slow-wave sleep supports the transfer of declarative memories from hippocampus to neocortex.", 0.92),
      ev("e31", "S28", "Each additional hour of average nightly sleep was associated with a 0.07 increase in end-of-term GPA.", 0.85),
    ],
    claims: [
      claim("c26", "Slow-wave sleep plays a central role in consolidating declarative memory.", "supported", 0.91, ["S27"], ["e30"]),
      claim("c27", "More sleep is associated with modestly higher grades.", "partially_supported", 0.68, ["S28"], ["e31"]),
    ],
    report: {
      summary: [
        "Sleep — especially slow-wave sleep — is central to consolidating newly learned facts [1]. Cohort data link longer average sleep to modestly higher grades, though the association is observational [2].",
      ],
      findings: [
        { title: "Consolidation mechanism", body: "Slow-wave sleep supports hippocampal–neocortical memory transfer [1].", claimIds: ["c26"] },
        { title: "Academic outcomes", body: "An extra hour of sleep was associated with a 0.07 GPA increase [2].", claimIds: ["c27"] },
      ],
      analysis: [{ heading: "Practical implications", paragraphs: ["Evidence supports protecting sleep before exams rather than trading it for extra study time [1][2]."] }],
      limitations: ["Cohort findings are correlational; confounders such as workload and health may contribute."],
    },
  }),

  session({
    id: "r-usage-pricing",
    title: "Usage-based pricing in B2B SaaS",
    query: "Does usage-based pricing improve net revenue retention for B2B SaaS companies?",
    topic: "Business",
    mode: "quick",
    channels: ["web"],
    projectId: "p-product",
    status: "complete",
    createdAt: "2026-09-03T13:37:00Z",
    completedAt: "2026-09-03T13:37:48Z",
    metrics: { sources: 10, evidence: 15, candidateClaims: 7, verifiedClaims: 5 },
    sourceIds: ["S29", "S30"],
    evidence: [
      ev("e32", "S29", "Companies with a usage-based component reported median net revenue retention of 112%, versus 104% for pure subscription models.", 0.86),
      ev("e33", "S30", "Hybrid models combining a platform fee with usage tiers reduced revenue volatility while retaining expansion upside.", 0.78),
    ],
    claims: [
      claim("c28", "Usage-based components correlate with higher net revenue retention.", "partially_supported", 0.7, ["S29"], ["e32"]),
      claim("c29", "Hybrid pricing reduces revenue volatility.", "supported", 0.77, ["S30"], ["e33"]),
    ],
    report: {
      summary: [
        "Companies with usage-based pricing report higher median net revenue retention [1], though the data is survey-based and may reflect selection effects. Hybrid models appear to capture expansion while reducing volatility [2].",
      ],
      findings: [
        { title: "Higher NRR, with caveats", body: "112% versus 104% median NRR in the surveyed sample [1].", claimIds: ["c28"] },
        { title: "Hybrid is the pragmatic middle", body: "A base fee plus usage tiers stabilises revenue [2].", claimIds: ["c29"] },
      ],
      analysis: [{ heading: "What it means for pricing design", paragraphs: ["Align the usage metric with delivered value, and keep a predictable platform fee for budgeting [2]."] }],
      limitations: ["Survey respondents self-select; causation between pricing model and retention is not established."],
    },
  }),

  session({
    id: "r-small-models",
    title: "Small language models on-device",
    query: "How capable are sub-4B parameter language models running on mobile devices?",
    topic: "AI / ML",
    mode: "standard",
    channels: ["web", "academic"],
    projectId: "p-ai-research",
    status: "complete",
    createdAt: "2026-08-29T17:25:00Z",
    completedAt: "2026-08-29T17:26:30Z",
    metrics: { sources: 15, evidence: 22, candidateClaims: 9, verifiedClaims: 8 },
    sourceIds: ["S31", "S32"],
    evidence: [
      ev("e34", "S31", "Quantisation-aware training at 4 bits retained 97% of full-precision benchmark accuracy for a 3B model.", 0.89),
      ev("e35", "S32", "Flagship mobile NPUs sustained 18–26 tokens per second for 3B models at 4-bit precision.", 0.84),
    ],
    claims: [
      claim("c30", "4-bit quantisation preserves most accuracy for 3B models.", "supported", 0.87, ["S31"], ["e34"]),
      claim("c31", "Flagship phones can run 3B models at interactive speeds.", "supported", 0.82, ["S32"], ["e35"]),
    ],
    report: {
      summary: [
        "Sub-4B models are now practical on flagship phones: 4-bit quantisation-aware training retains about 97% of accuracy [1], and modern NPUs sustain 18–26 tokens per second [2].",
      ],
      findings: [
        { title: "Quantisation is nearly lossless", body: "97% of full-precision accuracy retained at 4 bits [1].", claimIds: ["c30"] },
        { title: "Interactive speed on flagships", body: "18–26 tokens/s on current NPUs [2].", claimIds: ["c31"] },
      ],
      analysis: [{ heading: "Where they fit", paragraphs: ["On-device models suit private, latency-sensitive tasks such as summarisation and drafting, with cloud models reserved for deep reasoning [1][2]."] }],
      limitations: ["Mid-range device performance varies widely and is under-reported."],
    },
  }),

  // Error-state sessions — demonstrate PRD §48 states in context.
  session({
    id: "r-chip-export-controls",
    title: "Semiconductor export controls and AI chip supply",
    query: "How have semiconductor export controls affected AI accelerator supply chains?",
    topic: "Policy",
    mode: "deep",
    channels: ["web", "academic"],
    projectId: null,
    status: "failed",
    createdAt: "2026-09-26T07:12:00Z",
    metrics: { sources: 7, evidence: 9, candidateClaims: 4, verifiedClaims: 0 },
    sourceIds: [],
    evidence: [],
    claims: [],
  }),
  session({
    id: "r-lithium-2035",
    title: "Global lithium supply forecasts to 2035",
    query: "What do major forecasts say about global lithium supply and demand through 2035?",
    topic: "Energy",
    mode: "deep",
    channels: ["web", "academic"],
    projectId: "p-climate",
    status: "timeout",
    createdAt: "2026-09-10T19:40:00Z",
    metrics: { sources: 21, evidence: 17, candidateClaims: 8, verifiedClaims: 3 },
    sourceIds: [],
    evidence: [],
    claims: [],
  }),
  session({
    id: "r-artisan-coffee",
    title: "Export volumes of Nagaland specialty coffee",
    query: "What were the export volumes of Nagaland specialty coffee in 2025?",
    topic: "Business",
    mode: "quick",
    channels: ["web"],
    projectId: null,
    status: "no_sources",
    createdAt: "2026-09-01T12:10:00Z",
    metrics: { sources: 2, evidence: 0, candidateClaims: 0, verifiedClaims: 0 },
    sourceIds: [],
    evidence: [],
    claims: [],
  }),
];
