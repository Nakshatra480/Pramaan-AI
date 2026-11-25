import { BookMarked, FolderClosed, Globe, Library, type LucideIcon } from "lucide-react";
import type { ResearchMode, SourceChannel } from "@/types";

/** `eta`: typical duration, from measured runs (audit M-06). Varies with source count and provider load. */
export const MODES: { value: ResearchMode; label: string; description: string; eta: string }[] = [
  { value: "quick", label: "Quick", description: "Fast research citing about 10 sources.", eta: "about 1 min" },
  { value: "standard", label: "Standard", description: "Balanced research citing about 35 sources.", eta: "about 2 min" },
  { value: "deep", label: "Deep Research", description: "Broadest discovery citing about 50 sources, deeper verification.", eta: "2–4 min" },
];

export const CHANNELS: { value: SourceChannel; label: string; icon: LucideIcon; description: string }[] = [
  { value: "web", label: "Web", icon: Globe, description: "The open web and Wikipedia, pages read in full" },
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
