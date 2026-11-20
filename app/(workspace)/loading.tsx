import { PramaanLoader } from "@/components/brand/PramaanLoader";

export default function Loading() {
  return (
    <div className="grid place-items-center min-h-[60vh]" aria-busy="true" aria-label="Loading">
      <PramaanLoader size={64} label="Loading" />
    </div>
  );
}
