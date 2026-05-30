import { cn } from "@/lib/utils.ts";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="skeleton" className={cn("realm-skeleton rounded-md", className)} {...props} />
  );
}

export { Skeleton };
