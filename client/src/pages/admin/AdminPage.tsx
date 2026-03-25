/**
 * client/src/pages/admin/AdminPage.tsx
 *
 * Internal admin panel — route: /admin
 *
 * Access is enforced server-side by requireAdmin middleware (ADMIN_EMAIL env var).
 * The page also shows a graceful "Access denied" screen for non-admin users.
 *
 * Tabs:
 *   1. Users — searchable table, inline tier control
 *   2. Invite User — invite by email with pre-assigned tier
 *   3. Invite Codes — generate, list, and deactivate codes
 */

import { useState } from "react";
import {
  Users,
  UserPlus,
  Ticket,
  Shield,
  Search,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, apiRequestRaw, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/* ── Types mirroring server ──────────────────────────────────────────────── */

interface AdminUser {
  id: string;
  email: string | null;
  tier: "free" | "pro";
  createdAt: string;
}

interface InviteCode {
  id: string;
  code: string;
  tier: "free" | "pro";
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

/* ── Small helpers ───────────────────────────────────────────────────────── */

function TierBadge({ tier }: { tier: "free" | "pro" }) {
  return (
    <Badge
      className={
        tier === "pro"
          ? "bg-blue-600 text-white capitalize"
          : "bg-muted text-muted-foreground border border-border capitalize"
      }
    >
      {tier}
    </Badge>
  );
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title="Copy code"
      data-testid={`button-copy-${text}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 *  TAB 1: Users
 * ══════════════════════════════════════════════════════════════════════════ */

function UsersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingTier, setPendingTier] = useState<Record<string, string>>({});

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const tierMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/tier`, { tier });
    },
    onSuccess: (_data, { userId, tier }) => {
      toast({ title: "Tier updated", description: `User tier set to ${tier}.` });
      setPendingTier((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="w-6 h-6 text-amber-500" />
        <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }

  const users = data?.users ?? [];
  const filtered = users.filter((u) =>
    search.trim() === "" || (u.email ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-user-search"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-1.5"
          data-testid="button-refresh-users"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} users</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm" data-testid="table-users">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tier</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Joined</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Change tier</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            ) : (
              filtered.map((user) => {
                const selected = pendingTier[user.id] ?? user.tier;
                const isDirty = selected !== user.tier;
                return (
                  <tr
                    key={user.id}
                    className="border-t border-border hover:bg-muted/20 transition-colors"
                    data-testid={`row-user-${user.id}`}
                  >
                    <td className="px-4 py-2.5 max-w-[220px] truncate font-mono text-xs text-foreground">
                      {user.email ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <TierBadge tier={user.tier} />
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmt(user.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Select
                          value={selected}
                          onValueChange={(val) =>
                            setPendingTier((prev) => ({ ...prev, [user.id]: val }))
                          }
                        >
                          <SelectTrigger className="h-7 w-24 text-xs" data-testid={`select-tier-${user.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant={isDirty ? "default" : "ghost"}
                          className="h-7 px-2.5 text-xs"
                          disabled={!isDirty || tierMutation.isPending}
                          onClick={() => tierMutation.mutate({ userId: user.id, tier: selected })}
                          data-testid={`button-save-tier-${user.id}`}
                        >
                          Save
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 *  TAB 2: Invite User
 * ══════════════════════════════════════════════════════════════════════════ */

function InviteTab() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<"free" | "pro">("pro");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setResult(null);
    const res = await apiRequestRaw("POST", "/api/admin/invite", { email: email.trim(), tier });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (res.ok) {
      setResult({ ok: true, message: body.message ?? "Done." });
      setEmail("");
    } else {
      setResult({ ok: false, message: body.error ?? "Failed." });
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <p className="text-sm text-muted-foreground">
        Invite a new user by email with a pre-assigned tier, or update the tier of an existing
        account.
      </p>

      <form onSubmit={handleInvite} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-testid="input-invite-email"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite-tier">Assign tier</Label>
          <Select value={tier} onValueChange={(v) => setTier(v as "free" | "pro")}>
            <SelectTrigger id="invite-tier" className="w-36" data-testid="select-invite-tier">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {result && (
          <div
            className={`flex items-start gap-2 rounded-md px-3 py-2.5 border text-sm ${
              result.ok
                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                : "bg-destructive/10 border-destructive/20 text-destructive"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            )}
            <span data-testid="text-invite-result">{result.message}</span>
          </div>
        )}

        <Button
          type="submit"
          className="gap-2"
          disabled={submitting || !email.trim()}
          data-testid="button-send-invite"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {submitting ? "Sending…" : "Send Invite"}
        </Button>
      </form>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 *  TAB 3: Invite Codes
 * ══════════════════════════════════════════════════════════════════════════ */

function CodesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tier, setTier] = useState<"free" | "pro">("pro");
  const [maxUses, setMaxUses] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");

  const { data, isLoading, error, refetch } = useQuery<{ codes: InviteCode[] }>({
    queryKey: ["/api/admin/invite-codes"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/invite-codes", {
        tier,
        maxUses: maxUses ? parseInt(maxUses, 10) : null,
        expiresAt: expiresAt || null,
      });
      return res.json();
    },
    onSuccess: (body) => {
      toast({
        title: "Code generated",
        description: `Code ${body.code?.code ?? ""} created.`,
      });
      setMaxUses("");
      setExpiresAt("");
      qc.invalidateQueries({ queryKey: ["/api/admin/invite-codes"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (codeId: string) => {
      await apiRequest("PATCH", `/api/admin/invite-codes/${codeId}/deactivate`, {});
    },
    onSuccess: () => {
      toast({ title: "Code deactivated" });
      qc.invalidateQueries({ queryKey: ["/api/admin/invite-codes"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const codes = data?.codes ?? [];

  return (
    <div className="space-y-6">
      {/* Generate form */}
      <Card className="border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Generate new code</CardTitle>
          <CardDescription className="text-xs">
            Each code has a unique identifier in the format ATLAS-XXXX-XXXX.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as "free" | "pro")}>
                <SelectTrigger className="h-8 w-28 text-xs" data-testid="select-code-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max uses (optional)</Label>
              <Input
                type="number"
                min="1"
                placeholder="Unlimited"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="h-8 w-36 text-xs"
                data-testid="input-code-max-uses"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expires (optional)</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="h-8 w-44 text-xs"
                data-testid="input-code-expires"
              />
            </div>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              data-testid="button-generate-code"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Ticket className="w-3.5 h-3.5" />
              )}
              Generate code
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Codes list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">All codes</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="h-7 gap-1 text-xs"
            data-testid="button-refresh-codes"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : codes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No codes yet.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm" data-testid="table-codes">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Code</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tier</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Uses</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Expires</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-border hover:bg-muted/20 transition-colors"
                    data-testid={`row-code-${c.id}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {c.code}
                        </code>
                        <CopyButton text={c.code} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <TierBadge tier={c.tier} />
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">
                      {c.usesCount}{c.maxUses !== null ? ` / ${c.maxUses}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">
                      {c.expiresAt ? fmt(c.expiresAt) : "Never"}
                    </td>
                    <td className="px-4 py-2.5">
                      {c.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <XCircle className="w-3.5 h-3.5" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {c.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deactivateMutation.mutate(c.id)}
                          disabled={deactivateMutation.isPending}
                          data-testid={`button-deactivate-${c.id}`}
                        >
                          Deactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 *  ROOT: AdminPage
 * ══════════════════════════════════════════════════════════════════════════ */

export default function AdminPage() {
  // Check admin status (403 → access denied, 401 → not signed in)
  const { data: statusData, isLoading: statusLoading, error: statusError } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/status"],
    queryFn: getQueryFn({ on401: "throw" }),
    retry: false,
  });

  if (statusLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (statusError || !statusData?.isAdmin) {
    const msg = (statusError as Error)?.message ?? "Access denied.";
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-10 pb-10 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">Access denied</h2>
              <p className="text-sm text-muted-foreground">{msg}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-10 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Shield className="w-4.5 h-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Admin Panel</h1>
          <p className="text-xs text-muted-foreground">Custody Atlas — internal access only</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users">
        <TabsList className="h-9">
          <TabsTrigger value="users" className="gap-1.5 text-sm" data-testid="tab-users">
            <Users className="w-3.5 h-3.5" />
            Users
          </TabsTrigger>
          <TabsTrigger value="invite" className="gap-1.5 text-sm" data-testid="tab-invite">
            <UserPlus className="w-3.5 h-3.5" />
            Invite User
          </TabsTrigger>
          <TabsTrigger value="codes" className="gap-1.5 text-sm" data-testid="tab-codes">
            <Ticket className="w-3.5 h-3.5" />
            Invite Codes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="pt-5">
          <UsersTab />
        </TabsContent>

        <TabsContent value="invite" className="pt-5">
          <InviteTab />
        </TabsContent>

        <TabsContent value="codes" className="pt-5">
          <CodesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
