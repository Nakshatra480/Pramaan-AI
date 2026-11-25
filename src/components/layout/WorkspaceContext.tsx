import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface WorkspaceUI {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  createProjectOpen: boolean;
  setCreateProjectOpen: (v: boolean) => void;
}

const Ctx = createContext<WorkspaceUI | null>(null);
const KEY = "pramaan.sidebar.collapsed";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  }, []);

  const value = useMemo(
    () => ({ sidebarCollapsed, toggleSidebar, commandOpen, setCommandOpen, mobileNavOpen, setMobileNavOpen, createProjectOpen, setCreateProjectOpen }),
    [sidebarCollapsed, toggleSidebar, commandOpen, mobileNavOpen, createProjectOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
