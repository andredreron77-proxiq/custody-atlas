import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Home, Map, MessageSquare, FileSearch, Menu, X, LayoutDashboard, Lock, ShieldCheck, HelpCircle } from "lucide-react";
import { LogoMark } from "./LogoMark";
import { useQuery } from "@tanstack/react-query";
import { AuthButton } from "./AuthButton";
import { UsageIndicator } from "./UsageIndicator";
import { useCurrentUser } from "@/hooks/use-auth";
import { getQueryFn } from "@/lib/queryClient";

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
  { label: "Ask Atlas",         href: "/ask",             icon: MessageSquare,   gated: true },
  { label: "Analyze Document", href: "/upload-document", icon: FileSearch,      gated: true },
];

export function Header() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auth state — needed to gate the admin status check
  const { user, isLoading: authLoading } = useCurrentUser();

  // Admin status — only queried once the user is confirmed signed-in.
  // Uses the same query key as AdminPage so the result is shared from cache.
  const { data: adminStatus } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/status"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !authLoading && !!user,
    retry: false,
    staleTime: 30_000,
  });
  const isAdmin = adminStatus?.isAdmin === true;

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
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0" aria-label="Custody Atlas home">
            <LogoMark size={26} variant="onDark" />
            <span className="hidden sm:block font-semibold text-white tracking-tight" style={{ fontSize: "15px" }}>
              Custody Atlas
            </span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-0.5 ml-2" aria-label="Main navigation">
            {NAV_ITEMS.map(({ label, href, icon: Icon, exact, gated }) => {
              const active = isActive(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`
                    relative flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${active
                      ? "text-white bg-white/10"
                      : "text-slate-400 hover:text-white hover:bg-white/8"
                    }
                  `}
                  data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <span className={label === "Analyze Document" ? "hidden lg:inline" : ""}>
                    {label}
                  </span>
                  {gated && (
                    <Lock className="w-2.5 h-2.5 text-slate-600 flex-shrink-0" aria-label="Sign-in required" />
                  )}
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-white/40 rounded-full" />
                  )}
                </Link>
              );
            })}

            {/* Admin link — only shown to the designated admin user */}
            {isAdmin && (
              <Link
                href="/admin"
                className={`
                  relative flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors
                  ${isActive("/admin")
                    ? "text-amber-300 bg-amber-500/15"
                    : "text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10"
                  }
                `}
                data-testid="nav-admin"
              >
                <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Admin</span>
                {isActive("/admin") && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-amber-400 rounded-full" />
                )}
              </Link>
            )}
          </nav>

          {/* Desktop: getting started + usage indicator + auth button */}
          <div className="hidden md:flex items-center gap-3 ml-auto">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("custody-atlas:open-onboarding"))}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-xs px-2 py-1.5 rounded-md hover:bg-white/8"
              data-testid="button-getting-started"
              title="Getting Started"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Getting Started</span>
            </button>
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

              {/* Admin link — only shown to the designated admin user */}
              {isAdmin && (
                <li>
                  <Link
                    href="/admin"
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors
                      ${isActive("/admin")
                        ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        : "text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent"
                      }
                    `}
                    data-testid="mobile-nav-admin"
                  >
                    <span className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${isActive("/admin") ? "bg-amber-500/30" : "bg-amber-500/10"}`}>
                      <ShieldCheck className="w-4 h-4 text-amber-400" />
                    </span>
                    <span className="flex-1">Admin</span>
                    {isActive("/admin") && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    )}
                  </Link>
                </li>
              )}

              {/* Getting Started — reopens onboarding modal */}
              <li>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    window.dispatchEvent(new CustomEvent("custody-atlas:open-onboarding"));
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-300 hover:text-white hover:bg-white/8 border border-transparent transition-colors"
                  data-testid="mobile-nav-getting-started"
                >
                  <span className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
                    <HelpCircle className="w-4 h-4" />
                  </span>
                  <span className="flex-1">Getting Started</span>
                </button>
              </li>
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
