import type { ReactNode } from "react";
import { useFixedBottomHeight } from "@/hooks/useFixedBottomHeight";

export default function BottomActionBar({ children }: { children: ReactNode }) {
  const ref = useFixedBottomHeight<HTMLDivElement>("--app-bottom-action-height");
  return <div ref={ref} className="bottom-action-bar fixed left-0 right-0 z-40 border-t border-border bg-card p-4">{children}</div>;
}
