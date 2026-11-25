/** User & preference types. Identity comes from Firebase Auth (future); profile lives in Neon (PRD §9). */
import type { ResearchMode, SourceChannel } from "./research";

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  avatarUrl?: string;
  initials: string;
  provider: "password" | "google";
  createdAt: string;
  onboarded: boolean;
  plan: "free" | "personal" | "pro" | "team";
}

export type CitationStyle = "numeric" | "apa" | "mla" | "chicago";
export type ResponseLength = "concise" | "balanced" | "comprehensive";
export type ThemePreference = "light" | "dark" | "system";

export interface UserPreferences {
  interests: string[];
  defaultMode: ResearchMode;
  defaultChannels: SourceChannel[];
  citationStyle: CitationStyle;
  responseLength: ResponseLength;
  theme: ThemePreference;
  reducedMotion: boolean;
  /** In-app notifications (the bell). Pramaan doesn't send email notifications. */
  notifications: {
    researchComplete: boolean;
    documentIndexed: boolean;
  };
  retentionDays: 30 | 90 | 365 | 0;
}
