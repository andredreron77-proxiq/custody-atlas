import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  ShieldAlert,
  UserCircle2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, PageShell } from "@/components/app/PageShell";
import UpgradeModal from "@/components/app/UpgradeModal";
import { useCurrentUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useUsage } from "@/hooks/use-usage";
import { useUserProfile } from "@/hooks/use-user-profile";
import { supabase } from "@/lib/supabaseClient";
import { apiRequestRaw } from "@/lib/queryClient";
import { signOut } from "@/services/authService";

function formatMemberSince(value: string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatPlan(tier: string | null | undefined): string {
  return tier === "pro" ? "Pro" : "Free";
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

export default function AccountPage() {
  const { user } = useCurrentUser();
  const { data: profile } = useUserProfile();
  const { usage } = useUsage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.displayName ?? "");
  }, [profile?.displayName]);

  const isProUser =
    (profile?.tier === "pro" || usage?.tier === "pro") &&
    (usage?.isAuthenticated === true || !!user);
  const memberSince = formatMemberSince(profile?.createdAt);
  const email = user?.email ?? "Not available";
  const stateLabel = profile?.jurisdictionState ?? "Not set";
  const countyLabel = profile?.jurisdictionCounty ?? "Not set";
  const currentPlan = useMemo(() => formatPlan(profile?.tier ?? usage?.tier), [profile?.tier, usage?.tier]);
  const trimmedDisplayName = displayName.trim();
  const canSaveDisplayName =
    trimmedDisplayName.length > 0 &&
    trimmedDisplayName !== (profile?.displayName ?? "") &&
    !isSavingDisplayName;

  async function handleSaveDisplayName() {
    if (!canSaveDisplayName) return;
    setIsSavingDisplayName(true);
    try {
      const res = await apiRequestRaw("PATCH", "/api/user-profile/display-name", {
        displayName: trimmedDisplayName,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not save display name.");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/user-profile"] });
      toast({
        title: "Display name saved",
        description: "Your account profile has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Could not save display name",
        description: error?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSavingDisplayName(false);
    }
  }

  async function handleManageSubscription() {
    setIsOpeningPortal(true);
    try {
      const res = await apiRequestRaw("POST", "/api/billing/portal");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not open billing portal.");
      }
      const data = await res.json().catch(() => ({} as { url?: string }));
      if (!data.url) {
        throw new Error("Billing portal URL was missing.");
      }
      window.location.href = data.url;
    } catch (error: any) {
      toast({
        title: "Could not open billing portal",
        description: error?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsOpeningPortal(false);
    }
  }

  async function handleSendPasswordReset() {
    if (!user?.email) return;
    setIsSendingReset(true);
    setResetMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetMessage("Check your email for a password reset link");
    } catch (error: any) {
      toast({
        title: "Could not start password reset",
        description: error?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSendingReset(false);
    }
  }

  async function handleDeleteAccountFallback() {
    setIsDeletingAccount(true);
    try {
      await signOut();
      toast({
        title: "Account deletion request",
        description: "Contact support@custodyatlas.com to complete account deletion",
      });
    } finally {
      setIsDeletingAccount(false);
      setDeleteDialogOpen(false);
    }
  }

  return (
    <PageShell className="max-w-4xl">
      <PageHeader
        eyebrow="Account"
        title="Account Settings"
        subtitle="Manage your profile, subscription, security settings, and support options."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5">
                <UserCircle2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Update the basics Atlas uses across your account.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account-display-name">Display name</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="account-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                  maxLength={80}
                />
                <Button type="button" onClick={handleSaveDisplayName} disabled={!canSaveDisplayName}>
                  {isSavingDisplayName ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Email" value={email} />
              <DetailRow label="Member since" value={memberSince} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5">
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>Location</CardTitle>
                <CardDescription>Your account’s default jurisdiction context.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Default state" value={stateLabel} />
              <DetailRow label="Default county" value={countyLabel} />
            </div>
            <p className="text-sm text-muted-foreground">
              To update your location, start a new case.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>Subscription</CardTitle>
                <CardDescription>View your current plan and manage billing.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <DetailRow label="Current plan" value={usage ? currentPlan : "Loading..."} />
            {isProUser ? (
              <Button type="button" onClick={handleManageSubscription} disabled={isOpeningPortal}>
                {isOpeningPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Manage Subscription
              </Button>
            ) : (
              <Button type="button" onClick={() => setUpgradeOpen(true)}>
                Upgrade to Pro
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5">
                <Lock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>Security</CardTitle>
                <CardDescription>Keep your account secure and up to date.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button type="button" variant="outline" onClick={handleSendPasswordReset} disabled={!user?.email || isSendingReset}>
              {isSendingReset ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Change password
            </Button>
            {resetMessage ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">{resetMessage}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-red-200 dark:border-red-900/50">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 dark:border-red-900/50 dark:bg-red-950/30">
                <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle>Danger Zone</CardTitle>
                <CardDescription>Permanent account actions should be handled carefully.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <AlertTriangle className="h-4 w-4" />
              Delete account
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account and all case data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAccount}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteAccountFallback();
              }}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={isDeletingAccount}
            >
              {isDeletingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </PageShell>
  );
}
