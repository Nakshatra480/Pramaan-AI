import { redirect } from "next/navigation";

/** Sign-in and "Open Pramaan" land here; the workspace starts at New research. */
export default function AppEntry() {
  redirect("/research/new");
}
