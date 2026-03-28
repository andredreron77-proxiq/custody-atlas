/**
 * ProductLayout — shared layout and composition primitives for authenticated product pages.
 *
 * Components:
 *   PageContainer      — centered content area with configurable width/spacing
 *   PageIntro          — eyebrow + title + description + optional right slot
 *   ContextBar         — slim contextual row for jurisdiction / privacy / session info
 *   HeroPanel          — dominant primary card with strong visual weight
 *   HeroPanelHeader    — header slot for HeroPanel with border-b separator
 *   HeroPanelContent   — padded body content area for HeroPanel
 *   HeroPanelFooter    — muted footer slot for HeroPanel
 *   Panel              — standard secondary panel (lighter, less prominent)
 *   PanelHeader        — compact header with icon, label, optional action
 *   PanelContent       — padded content area for Panel
 *   InsetPanel         — nested information block: quick facts, metadata, security notes
 *   ActionRow          — full-width clickable row: icon + title + description + chevron
 *   SectionStack       — vertical section rhythm wrapper
 *
 * Design rules:
 *   - Calm, premium legal-tech feel
 *   - Soft borders, soft shadows, rounded corners
 *   - HeroPanel surfaces are white on a light background — clearly dominant
 *   - Panel surfaces are muted/inset — clearly secondary
 *   - InsetPanel is the innermost layer — quietest visual weight
 *   - ActionRow is the primary interactive affordance — always feels tappable
 */

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";

/* ── PageContainer ──────────────────────────────────────────────────────────── */

interface PageContainerProps {
  children: React.ReactNode;
  size?: "wide" | "medium" | "narrow";
  className?: string;
  testId?: string;
}

export function PageContainer({ children, size = "wide", className, testId }: PageContainerProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "mx-auto px-4 sm:px-6 animate-fade-in",
        size === "wide"   && "max-w-[1200px] py-8 space-y-10",
        size === "medium" && "max-w-3xl py-9 space-y-8",
        size === "narrow" && "max-w-2xl py-10 space-y-7",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ── PageIntro ──────────────────────────────────────────────────────────────── */

interface PageIntroProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  right?: React.ReactNode;
  className?: string;
  titleTestId?: string;
}

export function PageIntro({ eyebrow, title, description, right, className, titleTestId }: PageIntroProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            {eyebrow}
          </p>
        )}
        <h1
          className="font-serif text-[28px] md:text-4xl font-bold text-foreground leading-tight tracking-tight"
          data-testid={titleTestId ?? "page-title"}
        >
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed max-w-md">
            {description}
          </p>
        )}
      </div>
      {right && <div className="flex-shrink-0 mt-1">{right}</div>}
    </div>
  );
}

/* ── ContextBar ─────────────────────────────────────────────────────────────── */

interface ContextBarProps {
  left: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  testId?: string;
}

export function ContextBar({ left, right, className, testId }: ContextBarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-border/50 bg-muted/40",
        className
      )}
      data-testid={testId}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">{left}</div>
      {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
    </div>
  );
}

/* ── HeroPanel ──────────────────────────────────────────────────────────────── */

interface HeroPanelProps {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export function HeroPanel({ children, className, testId }: HeroPanelProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-sm overflow-hidden",
        className
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

interface HeroPanelHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function HeroPanelHeader({ children, className }: HeroPanelHeaderProps) {
  return (
    <div className={cn("px-6 pt-6 pb-5 border-b border-border/60", className)}>
      {children}
    </div>
  );
}

interface HeroPanelContentProps {
  children: React.ReactNode;
  className?: string;
}

export function HeroPanelContent({ children, className }: HeroPanelContentProps) {
  return (
    <div className={cn("px-6 py-6", className)}>
      {children}
    </div>
  );
}

interface HeroPanelFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function HeroPanelFooter({ children, className }: HeroPanelFooterProps) {
  return (
    <div className={cn("border-t border-border/60 bg-muted/30 dark:bg-muted/10 px-6 py-6", className)}>
      {children}
    </div>
  );
}

/* ── Panel ──────────────────────────────────────────────────────────────────── */

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export function Panel({ children, className, testId }: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-muted/20 dark:bg-muted/10 overflow-hidden",
        className
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

interface PanelHeaderProps {
  icon?: LucideIcon;
  label: string;
  action?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}

export function PanelHeader({ icon: Icon, label, action, meta, className }: PanelHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between px-4 py-3.5 border-b border-border/50", className)}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-primary/60" />}
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground leading-none">
          {label}
        </span>
        {meta && <span className="ml-1.5">{meta}</span>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface PanelContentProps {
  children: React.ReactNode;
  className?: string;
}

export function PanelContent({ children, className }: PanelContentProps) {
  return (
    <div className={cn("p-4", className)}>
      {children}
    </div>
  );
}

/* ── InsetPanel ─────────────────────────────────────────────────────────────── */

interface InsetPanelProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "info";
  className?: string;
  testId?: string;
}

export function InsetPanel({ children, variant = "default", className, testId }: InsetPanelProps) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        variant === "default" && "border-border/50 bg-muted/40 dark:bg-muted/20",
        variant === "success" && "border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20",
        variant === "warning" && "border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30",
        variant === "info"    && "border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30",
        className
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/* ── ActionRow ──────────────────────────────────────────────────────────────── */

interface ActionRowProps {
  href?: string;
  onClick?: () => void;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description?: string;
  testId?: string;
  disabled?: boolean;
  className?: string;
}

export function ActionRow({
  href,
  onClick,
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  testId,
  disabled,
  className,
}: ActionRowProps) {
  const inner = (
    <div
      className={cn(
        "w-full flex items-center gap-4 px-5 py-[15px] rounded-xl border border-border bg-card text-left",
        "hover:border-primary/50 hover:bg-primary/[0.04] hover:-translate-y-0.5 hover:shadow-md",
        "active:translate-y-0 active:shadow-none transition-all duration-150 group",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      data-testid={testId}
    >
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm", iconBg)}>
        <Icon className={cn("w-5 h-5", iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
          {title}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/25 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
    </div>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return (
    <button onClick={onClick} className="w-full cursor-pointer" type="button">
      {inner}
    </button>
  );
}

/* ── SectionStack ───────────────────────────────────────────────────────────── */

interface SectionStackProps {
  children: React.ReactNode;
  gap?: "sm" | "md" | "lg";
  className?: string;
}

export function SectionStack({ children, gap = "md", className }: SectionStackProps) {
  return (
    <div
      className={cn(
        gap === "sm" && "space-y-3",
        gap === "md" && "space-y-5",
        gap === "lg" && "space-y-8",
        className
      )}
    >
      {children}
    </div>
  );
}
