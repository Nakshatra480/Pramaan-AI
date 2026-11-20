import { redirect } from "next/navigation";

/** Merged into the landing page; keep old links working. */
export default function Page() {
  redirect("/#trust");
}
