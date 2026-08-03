interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="px-4 pb-5 pt-7 sm:px-6 sm:pt-9">
      <div className="flex items-start gap-3">
        <span className="mt-1 h-10 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="text-[1.65rem] font-bold leading-tight tracking-[-0.025em] text-foreground sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm font-medium text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </header>
  );
}
