import { Link, useLocation } from "wouter";
import { Scale, Home, Map, MessageSquare, FileSearch } from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home, exact: true },
  { label: "Custody Map", href: "/custody-map", icon: Map },
  { label: "Ask AI", href: "/ask", icon: MessageSquare },
  { label: "Analyze Document", href: "/upload-document", icon: FileSearch },
];

export function Header() {
  const [location] = useLocation();

  const isActive = (href: string, exact = false) => {
    if (exact) return location === href;
    return location === href || location.startsWith(href + "/") || location.startsWith(href + "?");
  };

  return (
    <header className="sticky top-0 z-50 bg-[#0f172a] shadow-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

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
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-0.5" aria-label="Main navigation">
          {NAV_ITEMS.map(({ label, href, icon: Icon, exact }) => {
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
                <span className={label === "Analyze Document" ? "hidden lg:inline" : "hidden sm:inline"}>
                  {label}
                </span>
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-400 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
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
