import { BookMarked, FolderClosed, Globe, Library, type LucideIcon } from "lucide-react";
import type { ResearchMode, SourceChannel } from "@/types";

/** `eta`: typical duration, from measured runs (audit M-06). Varies with source count and provider load. */
export const MODES: { value: ResearchMode; label: string; description: string; eta: string }[] = [
  { value: "quick", label: "Quick", description: "Fast research with essential sources.", eta: "under 1 min" },
  { value: "standard", label: "Standard", description: "Balanced research and evidence.", eta: "about 1 min" },
  { value: "deep", label: "Deep Research", description: "Broader discovery, deeper verification, more extensive synthesis.", eta: "1–2 min" },
];

export const CHANNELS: { value: SourceChannel; label: string; icon: LucideIcon; description: string }[] = [
  { value: "web", label: "Web", icon: Globe, description: "Current information from the open web" },
  { value: "academic", label: "Academic", icon: BookMarked, description: "Papers, journals and preprints" },
  { value: "project", label: "Project Library", icon: FolderClosed, description: "Documents in the selected project" },
  { value: "library", label: "Global Library", icon: Library, description: "Everything in your library" },
];

export const EXAMPLE_QUESTIONS = [
  "What are the latest developments in humanoid robotics?",
  "Compare retrieval-augmented generation with long-context models.",
  "When will solid-state batteries reach mass production?",
  "Do GLP-1 drugs reduce cardiovascular events without diabetes?",
];
