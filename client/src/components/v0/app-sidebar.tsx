"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

const sidebarItems = [
  { href: "/workspace", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workspace/documents", label: "My Documents", icon: FileText },
  { href: "/workspace/cases", label: "Cases", icon: FolderOpen },
  { href: "/ask-atlas", label: "AI Assistant", icon: MessageSquare },
  { href: "/workspace/settings", label: "Settings", icon: Settings },
]

interface AppSidebarProps {
  className?: string
}

export function AppSidebar({ className }: AppSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64",
        className
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed && (
          <span className="text-sm font-medium text-sidebar-foreground/70">
            Workspace
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {sidebarItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Premium Features Indicator */}
      {!collapsed && (
        <div className="p-4 m-3 rounded-lg bg-sidebar-accent border border-sidebar-border">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-gold" />
            <span className="text-xs font-medium text-sidebar-foreground">
              Premium Features
            </span>
          </div>
          <p className="text-xs text-sidebar-foreground/60 mb-3">
            Unlock advanced document analysis and priority support.
          </p>
          <Button
            size="sm"
            className="w-full bg-gold hover:bg-gold-light text-navy-dark text-xs"
          >
            Upgrade
          </Button>
        </div>
      )}
    </aside>
  )
}
