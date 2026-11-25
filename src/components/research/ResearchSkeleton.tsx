import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Research document skeleton — mirrors the report layout so nothing jumps on load. */
export function ResearchSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-10 py-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy="true" aria-label="Loading research">
      <div className="max-w-[720px] space-y-5">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-11 w-11/12" />
        <Skeleton className="h-11 w-2/3" />
        <Skeleton className="h-3.5 w-80 mt-6" />
        <div className="flex gap-2 pt-2">
          {["w-20", "w-20", "w-24", "w-28"].map((w, i) => (
            <Skeleton key={i} className={`h-8 ${w}`} />
          ))}
        </div>
        <div className="pt-10 space-y-4">
          <Skeleton className="h-7 w-56" />
          <SkeletonText lines={5} />
        </div>
        <div className="pt-8 space-y-4">
          <Skeleton className="h-7 w-44" />
          <SkeletonText lines={4} />
        </div>
      </div>
      <SourcePanelSkeleton />
    </div>
  );
}

export function SourcePanelSkeleton() {
  return (
    <div className="hidden lg:block space-y-3" aria-hidden>
      <Skeleton className="h-3.5 w-24 mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 p-3 rounded-lg border border-line/70">
          <Skeleton className="size-5 rounded-[5px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
