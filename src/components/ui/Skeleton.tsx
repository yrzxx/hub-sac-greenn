import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-sand-line/70", className)}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-sand-line bg-sand-surface p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
