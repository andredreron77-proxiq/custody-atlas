import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Scale, Home, Map, MessageSquare, FileSearch, Menu, X, LayoutDashboard, Lock } from "lucide-react";
import { AuthButton } from "./AuthButton";
import { UsageIndicator } from "./UsageIndicator";

interface NavItem {
  label: string;
  href: string;
  icon: typeof Home;
  exact?: boolean;
  gated?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home",             href: "/",               icon: Home,            exact: true },
  { label: "Workspace",        href: "/workspace",       icon: LayoutDashboard, gated: true },
  { label: "Custody Map",      href: "/custody-map",     icon: Map },
  { label: "Ask AI",           href: "/ask",             icon: MessageSquare,   gated: true },
  { label: "Analyze Document", href: "/upload-document", icon: FileSearch,      gated: true },
];

export function Header() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string, exact = false) => {
    if (exact) return location === href;
    return location === href || location.startsWith(href + "/") || location.startsWith(href + "?");
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#0f172a] shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group" aria-label="Custody Atlas home">
            <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center">
              <Scale className="w-4 h-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-white text-sm tracking-tight leading-none block">
                Custody Atlas
              </span>
              <span className="text-blue-300/80 text-[11px] leading-none block mt-0.5">
                Understand custody law where you live.
              </span>
            </div>
            <span className="sm:hidden font-bold text-white text-sm tracking-tight">
              Custody Atlas
            </span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-0.5" aria-label="Main navigation">
            {NAV_ITEMS.map(({ label, href, icon: Icon, exact, gated }) => {
              const active = isActive(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`
                    relative flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${active
                      ? "text-white bg-white/10"
                      : "text-slate-300 hover:text-white hover:bg-white/8"
                    }
                  `}
                  data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className={label === "Analyze Document" ? "hidden lg:inline" : ""}>
                    {label}
                  </span>
                  {gated && (
                    <Lock className="w-2.5 h-2.5 text-slate-500 flex-shrink-0" aria-label="Sign-in required" />
                  )}
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-400 rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Desktop: usage indicator + auth button */}
          <div className="hidden md:flex items-center gap-3 ml-auto">
            <UsageIndicator />
            <AuthButton />
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden ml-auto flex items-center justify-center w-9 h-9 rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            data-testid="button-mobile-menu-toggle"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile menu drawer */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ top: "64px" }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <nav
            id="mobile-nav"
            className="relative bg-[#0f172a] border-b border-white/10 shadow-2xl"
            aria-label="Mobile navigation"
          >
            <ul className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-1">
              {NAV_ITEMS.map(({ label, href, icon: Icon, exact, gated }) => {
                const active = isActive(href, exact);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors
                        ${active
                          ? "bg-blue-600/20 text-white border border-blue-500/30"
                          : "text-slate-300 hover:text-white hover:bg-white/8 border border-transparent"
                        }
                      `}
                      data-testid={`mobile-nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <span className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${active ? "bg-blue-600" : "bg-white/10"}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="flex-1">{label}</span>
                      {gated && (
                        <Lock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" aria-label="Sign-in required" />
                      )}
                      {active && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Mobile auth + usage footer */}
            <div className="max-w-6xl mx-auto px-4 pb-4 pt-2 border-t border-white/10 flex items-center justify-between gap-3">
              <UsageIndicator compact />
              <AuthButton />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground/50" aria-hidden="true">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
