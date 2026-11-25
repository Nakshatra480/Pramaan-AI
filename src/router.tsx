import { createBrowserRouter, redirect, type RouteObject } from "react-router";
import { AppLoading, NotFound, RootError, RootLayout } from "./root";

/** Lazily load one export of a route module as the route's component (each area is its own chunk). */
function page<M>(load: () => Promise<M>, pick: (m: M) => React.ComponentType) {
  return { lazy: async () => ({ Component: pick(await load()) }) };
}

const marketing = () => import("./routes/marketing");
const auth = () => import("./routes/auth");
const workspace = () => import("./routes/workspace");
const projects = () => import("./routes/projects");
const settings = () => import("./routes/settings");
const shared = () => import("./routes/shared");

export const routes: RouteObject[] = [
  {
    Component: RootLayout,
    ErrorBoundary: RootError,
    HydrateFallback: AppLoading,
    children: [
      {
        ...page(marketing, (m) => m.MarketingLayout),
        children: [
          { index: true, ...page(marketing, (m) => m.Landing) },
          { path: "pricing", ...page(marketing, (m) => m.Pricing) },
          { path: "privacy", ...page(marketing, (m) => m.Privacy) },
          // Merged into the landing page; keep old links working.
          { path: "security", loader: () => redirect("/#trust") },
          { path: "how-it-works", loader: () => redirect("/#how-it-works") },
        ],
      },
      {
        path: "auth",
        ...page(auth, (m) => m.AuthFrame),
        children: [
          { index: true, loader: () => redirect("/auth/login") },
          { path: "login", ...page(auth, (m) => m.Login) },
          { path: "signup", ...page(auth, (m) => m.Signup) },
          { path: "forgot-password", ...page(auth, (m) => m.ForgotPassword) },
          { path: "reset-password", ...page(auth, (m) => m.ResetPassword) },
          { path: "verify", ...page(auth, (m) => m.Verify) },
        ],
      },
      { path: "onboarding", ...page(auth, (m) => m.Onboarding) },
      { path: "shared/:shareId", ...page(shared, (m) => m.Shared) },
      {
        ...page(workspace, (m) => m.WorkspaceLayout),
        children: [
          {
            // Pathless: page errors render inside the workspace shell.
            lazy: async () => ({ ErrorBoundary: (await workspace()).WorkspaceError }),
            children: [
              // Sign-in and "Open Pramaan" land here; the workspace starts at New research.
              { path: "app", loader: () => redirect("/research/new") },
              { path: "research", loader: () => redirect("/research/new") },
              { path: "research/new", ...page(workspace, (m) => m.NewResearch) },
              { path: "research/:researchId", ...page(workspace, (m) => m.Research) },
              { path: "history", ...page(workspace, (m) => m.History) },
              { path: "library", ...page(workspace, (m) => m.Library) },
              { path: "library/:documentId", ...page(workspace, (m) => m.Document) },
              { path: "projects", ...page(workspace, (m) => m.Projects) },
              {
                path: "projects/:projectId",
                ...page(projects, (m) => m.ProjectLayout),
                children: [
                  { index: true, ...page(projects, (m) => m.ProjectResearch) },
                  { path: "library", ...page(projects, (m) => m.ProjectLibrary) },
                  { path: "instructions", ...page(projects, (m) => m.ProjectInstructions) },
                  { path: "activity", ...page(projects, (m) => m.ProjectActivity) },
                  { path: "settings", ...page(projects, (m) => m.ProjectSettings) },
                ],
              },
              {
                path: "settings",
                ...page(settings, (m) => m.SettingsLayout),
                children: [
                  { index: true, ...page(settings, (m) => m.Overview) },
                  { path: "profile", ...page(settings, (m) => m.Profile) },
                  { path: "research", ...page(settings, (m) => m.Research) },
                  { path: "ai", ...page(settings, (m) => m.AI) },
                  { path: "appearance", ...page(settings, (m) => m.Appearance) },
                  { path: "notifications", ...page(settings, (m) => m.Notifications) },
                  { path: "privacy", ...page(settings, (m) => m.Privacy) },
                  { path: "billing", ...page(settings, (m) => m.Billing) },
                ],
              },
            ],
          },
        ],
      },
      { path: "*", Component: NotFound },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
