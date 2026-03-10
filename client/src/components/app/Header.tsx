import { Link, useLocation } from "wouter";
import { Scale, MapPin, MessageSquare, ChevronRight, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <Scale className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-base tracking-tight hidden sm:block">
            Custody Atlas
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link href="/location">
            <Button
              variant={location === "/location" ? "secondary" : "ghost"}
              size="sm"
              className="flex items-center gap-1.5"
              data-testid="nav-location"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Find My Laws</span>
            </Button>
          </Link>
          <Link href="/ask">
            <Button
              variant={location.startsWith("/ask") ? "secondary" : "ghost"}
              size="sm"
              className="flex items-center gap-1.5"
              data-testid="nav-ask"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ask AI</span>
            </Button>
          </Link>
          <Link href="/upload-document">
            <Button
              variant={location.startsWith("/upload-document") ? "secondary" : "ghost"}
              size="sm"
              className="flex items-center gap-1.5"
              data-testid="nav-upload"
            >
              <FileSearch className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Analyze Doc</span>
            </Button>
          </Link>
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
    <nav className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
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
