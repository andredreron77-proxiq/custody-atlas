import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { resolvePreferredDisplayName, initialsFromPreferredName, useUserProfile } from "@/hooks/use-user-profile";
import { useCurrentUser } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface AttorneyShellProps {
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}

const NAV_ITEMS = [
  { label: "Clients", href: "/attorney" },
  { label: "Calendar" },
  { label: "Messages" },
  { label: "Profile" },
] as const;

export function AttorneyShell({ children, backHref, backLabel }: AttorneyShellProps) {
  const [location] = useLocation();
  const { user } = useCurrentUser();
  const { data: profile } = useUserProfile();

  const displayName = resolvePreferredDisplayName({
    profileDisplayName: profile?.displayName,
    profileFullName: profile?.fullName,
    authMetadataName: user?.authMetadataName,
    authDisplayName: user?.displayName,
    email: user?.email,
  }) ?? "Attorney";

  const initials = initialsFromPreferredName({
    profileDisplayName: profile?.displayName,
    profileFullName: profile?.fullName,
    authMetadataName: user?.authMetadataName,
    authDisplayName: user?.displayName,
    email: user?.email,
  });

  return (
    <div className="min-h-screen bg-[#f7f3ed] text-slate-900 dark:bg-[#0f1216] dark:text-slate-100">
      <header className="border-b border-black/10 bg-[#12171d] text-slate-100 dark:border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(74,222,128,0.16)]" />
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
              Custody Atlas · Attorney Portal
            </p>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href ? (location === item.href || location.startsWith(`${item.href}/`)) : false;

              if (!item.href) {
                return (
                  <span
                    key={item.label}
                    className="rounded-full px-3 py-1.5 text-sm text-slate-500"
                  >
                    {item.label}
                  </span>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-medium text-white">{displayName}</p>
              <p className="text-xs text-slate-400">Attorney account</p>
            </div>
            <Avatar className="h-9 w-9 border border-white/10 bg-white/5">
              <AvatarFallback className="bg-emerald-500/15 text-xs font-semibold text-emerald-100">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {backHref && backLabel ? (
          <Link
            href={backHref}
            className="mb-5 inline-flex items-center text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            {backLabel}
          </Link>
        ) : null}
        {children}
      </div>
    </div>
  );
}
