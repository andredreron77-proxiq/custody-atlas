"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Menu, Shield, Globe, MessageSquare, FileText, Map, User, LogIn } from "lucide-react"
import { useState } from "react"

const navItems = [
  { href: "/", label: "Home" },
  { href: "/workspace", label: "Workspace", locked: true },
  { href: "/custody-map", label: "Custody Map" },
  { href: "/ask-atlas", label: "Ask Atlas" },
  { href: "/analyze", label: "Analyze Document" },
]

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      <div className="relative flex items-center justify-center w-10 h-10">
        <div className="absolute inset-0 bg-gradient-to-br from-navy to-navy-dark rounded-lg" />
        <Shield className="relative w-5 h-5 text-gold" />
        <Globe className="absolute w-3 h-3 text-gold-light bottom-1 right-1 opacity-70" />
      </div>
      <span className="font-serif text-xl font-semibold tracking-tight text-navy dark:text-foreground">
        Custody Atlas
      </span>
    </Link>
  )
}

export function Navigation() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const isAuthenticated = false // TODO: Replace with actual auth state

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Logo />

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative px-4 py-2 text-sm font-medium transition-colors rounded-md hover:bg-secondary",
                pathname === item.href
                  ? "text-navy dark:text-gold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
              {item.locked && !isAuthenticated && (
                <span className="ml-1 text-xs opacity-50">🔒</span>
              )}
            </Link>
          ))}
        </nav>

        {/* Desktop Auth */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <Button variant="ghost" size="sm" className="gap-2">
              <User className="w-4 h-4" />
              Profile
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login" className="gap-2">
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
              </Button>
              <Button size="sm" className="bg-navy hover:bg-navy-light text-gold" asChild>
                <Link href="/signup">Get Started</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <div className="flex flex-col gap-6 mt-6">
              <Logo />
              <nav className="flex flex-col gap-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                      pathname === item.href
                        ? "bg-navy text-gold"
                        : "hover:bg-secondary"
                    )}
                  >
                    {item.label}
                    {item.locked && !isAuthenticated && (
                      <span className="text-xs opacity-50">🔒</span>
                    )}
                  </Link>
                ))}
              </nav>
              <div className="flex flex-col gap-2 pt-4 border-t">
                {isAuthenticated ? (
                  <Button variant="outline" className="w-full">
                    Profile
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" className="w-full" asChild>
                      <Link href="/login">Sign In</Link>
                    </Button>
                    <Button className="w-full bg-navy hover:bg-navy-light text-gold" asChild>
                      <Link href="/signup">Get Started</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
