import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  variant?: "default" | "success" | "warning" | "destructive";
}

const variantClasses = {
  default: "bg-secondary text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export default function StatCard({ label, value, icon: Icon, variant = "default" }: StatCardProps) {
  return (
    <div className="surface-card animate-fade-in rounded-xl p-4">
      <div className="flex items-center gap-3.5">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", variantClasses[variant])}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold leading-none tracking-[-0.035em] text-foreground">{value}</p>
          <p className="mt-1 text-xs font-medium leading-tight text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}
