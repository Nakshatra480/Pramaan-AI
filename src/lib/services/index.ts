/**
 * Service boundary.
 *
 * Every UI component reads and writes data through `services`. Two
 * implementations share one surface:
 *   - "api":  Firebase Authentication + the FastAPI backend (lib/api/*)
 *   - "mock": in-browser demo data (lib/mock/*)
 * Selected by VITE_DATA_SOURCE (see lib/api/config.ts). Each API
 * adapter is typed as its mock counterpart, so the compiler keeps them in sync.
 */
import { firebaseAuthService } from "@/lib/api/auth";
import { DATA_SOURCE } from "@/lib/api/config";
import { apiEvents } from "@/lib/api/events";
import { apiLibraryService } from "@/lib/api/library";
import { apiProjectService } from "@/lib/api/projects";
import { apiResearchService } from "@/lib/api/research";
import { apiSearchAll } from "@/lib/api/search";
import { apiSourceService } from "@/lib/api/sources";
import { apiRefine, apiTranscribe, type Dictation } from "@/lib/api/speech";
import { authService } from "@/lib/mock/auth";
import { db } from "@/lib/mock/db";
import { libraryService } from "@/lib/mock/library";
import { preferencesService } from "@/lib/mock/preferences";
import { projectService } from "@/lib/mock/projects";
import { researchService } from "@/lib/mock/research";
import { searchAll } from "@/lib/mock/search";
import { sourceService } from "@/lib/mock/sources";
import { tidyDictation } from "@/lib/speech/tidy";

const api = DATA_SOURCE === "api";

const auth: typeof authService = api ? firebaseAuthService : authService;
const research: typeof researchService = api ? apiResearchService : researchService;
const projects: typeof projectService = api ? apiProjectService : projectService;
const library: typeof libraryService = api ? apiLibraryService : libraryService;
const sources: typeof sourceService = api ? apiSourceService : sourceService;

export const services = {
  mode: DATA_SOURCE,
  auth,
  research,
  projects,
  library,
  sources,
  preferences: preferencesService,
  search: (api ? apiSearchAll : searchAll) as typeof searchAll,
  /**
   * Voice input. `transcribe`: server-side transcription where the browser can't transcribe itself (API mode only).
   * `refine`: cleans up a dictation (fillers, misheard words, spelling) — the API's model in API mode, local rules in demo mode.
   */
  speech: {
    transcribe: api ? apiTranscribe : null,
    refine: api ? apiRefine : async (text: string): Promise<Dictation> => ({ text: tidyDictation(text), original: text }),
  },
  /** Change feed — mock store updates, or API mutations/polls. */
  subscribe: api ? apiEvents.subscribe : db.subscribe,
};

export type Services = typeof services;
export type { SearchResult, SearchResultKind } from "@/lib/mock/search";
export { AuthError } from "./errors";
