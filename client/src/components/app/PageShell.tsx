/**
 * PageShell — shared layout primitives for all product pages.
 *
 * Components:
 *   PageShell      — standard centred page wrapper (max-w-4xl)
 *   PageShellWide  — wider wrapper for data-dense pages (max-w-5xl)
 *   PageHeader     — consistent title / subtitle / eyebrow / right-slot block
 *   SectionLabel   — small uppercase tracking label used above card/section groups
 *   Divider        — subtle horizontal rule
 *   EmptyState     — consistent empty / zero-data treatment
 *   InfoRow        — labelled key/value row used inside detail panels
 *
 * Why this exists:
 *   Before this file, every page invented its own max-width, padding, and
 *   heading hierarchy.  These primitives lock those values in one place so
 *   any future change (e.g. wider container) propagates everywhere.
 */

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface ShellProps {
  children: React.ReactNode;
  className?: string;
}

export function PageShell({ children, className }: ShellProps) {
  return (
    <div className={cn("max-w-4xl mx-auto px-4 sm:px-6 py-8 md:py-12 animate-fade-in", className)}>
      {children}
    </div>
  );
}

export function PageShellWide({ children, className }: ShellProps) {
  return (
    <div className={cn("max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-10 animate-fade-in", className)}>
      {children}
    </div>
  );
}

/* ── PageHeader ────────────────────────────────────────────────────────────── */

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  right?: React.ReactNode;
  center?: boolean;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  right,
  center = false,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex gap-4 mb-8",
        center ? "flex-col items-center text-center" : "items-start justify-between",
        className
      )}
    >
      <div className={`min-w-0 ${center ? "" : "flex-1"}`}>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            {eyebrow}
          </p>
        )}
        <h1
          className="font-serif text-2xl md:text-3xl font-semibold text-foreground leading-tight"
          data-testid="page-title"
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-prose">
            {subtitle}
          </p>
        )}
      </div>
      {right && !center && (
        <div className="flex-shrink-0 mt-1">{right}</div>
      )}
    </div>
  );
}

/* ── SectionLabel ──────────────────────────────────────────────────────────── */

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
  as?: "p" | "h2" | "h3" | "span";
}

export function SectionLabel({
  children,
  className,
  as: Tag = "p",
}: SectionLabelProps) {
  return (
    <Tag
      className={cn("text-[11px] font-semibold uppercase tracking-widest text-muted-foreground", className)}
    >
      {children}
    </Tag>
  );
}

/* ── Divider ───────────────────────────────────────────────────────────────── */

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-t border-border", className)} aria-hidden />;
}

/* ── EmptyState ────────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-10 gap-4 animate-fade-in", className)}>
      <div className="w-12 h-12 rounded-xl border border-border bg-background flex items-center justify-center shadow-xs">
        <Icon className="w-5 h-5 text-muted-foreground/50" />
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold text-sm text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

/* ── InfoRow ───────────────────────────────────────────────────────────────── */

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function InfoRow({ label, value, icon: Icon, className }: InfoRowProps) {
  return (
    <div className={cn("flex items-start gap-2.5 text-sm", className)}>
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
      <span className="text-muted-foreground flex-shrink-0 w-28 text-xs">{label}</span>
      <span className="text-foreground font-medium text-xs leading-relaxed">{value}</span>
    </div>
  );
}
