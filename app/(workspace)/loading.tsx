import { PramaanResearchAnimation } from "@/components/animations/PramaanResearchAnimation";

export default function Loading() {
  return (
    <div className="grid place-items-center min-h-[60vh]" aria-busy="true" aria-label="Loading">
      <PramaanResearchAnimation autoplay size={96} label="Loading" />
    </div>
  );
}
