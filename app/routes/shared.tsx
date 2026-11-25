import { useParams } from "react-router";
import { SharedReport } from "@/components/research/SharedReport";
import { usePageTitle } from "@/lib/navigation";

export function Shared() {
  usePageTitle("Shared research");
  const { shareId = "" } = useParams();
  return (
    <>
      <meta name="robots" content="noindex" />
      <SharedReport key={shareId} shareId={shareId} />
    </>
  );
}
