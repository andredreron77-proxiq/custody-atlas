import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/app/Header";
import { MinimalFooter } from "@/components/app/Footer";
import { ThemeProvider } from "@/components/app/ThemeProvider";
import { AuthRequiredCard } from "@/components/app/AuthRequiredCard";
import { OnboardingModal } from "@/components/app/OnboardingModal";
import { DisplayNamePromptGate } from "@/components/app/DisplayNamePromptGate";
import { useCurrentUser } from "@/hooks/use-auth";
import { identifyUser } from "@/lib/analytics";
import { apiRequestRaw } from "@/lib/queryClient";
import { fetchUsageState } from "@/services/usageService";

import LandingPage from "@/pages/LandingPage";
import LocationPage from "@/pages/LocationPage";
import JurisdictionPage from "@/pages/JurisdictionPage";
import AskAIPage from "@/pages/AskAIPage";
import ResourcesPage from "@/pages/ResourcesPage";
import UploadDocumentPage from "@/pages/UploadDocumentPage";
import CustodyMapPage from "@/pages/CustodyMapPage";
import WorkspacePage from "@/pages/WorkspacePage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import TermsOfServicePage from "@/pages/TermsOfServicePage";
import CustodyLawsStatePage from "@/pages/CustodyLawsStatePage";
import CustodyQuestionsPage from "@/pages/CustodyQuestionsPage";
import PublicQAPage from "@/pages/PublicQAPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import RedeemCodePage from "@/pages/RedeemCodePage";
import BillingSuccessPage from "@/pages/BillingSuccessPage";
import BillingCancelPage from "@/pages/BillingCancelPage";
import AdminPage from "@/pages/admin/AdminPage";
import CaseDashboardPage from "@/pages/CaseDashboardPage";
import DocumentDetailPage from "@/pages/DocumentDetailPage";
import NotFound from "@/pages/not-found";
import type { ComponentType } from "react";

function AppFooter() {
  return <MinimalFooter />;
}

/** Scroll the window to the top on every route change. */
function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location]);
  return null;
}

type GatedFeature = "ask-ai" | "analyze-document" | "workspace";

/**
 * ProtectedRoute — wraps a page component behind authentication.
 *
 * Shows AuthRequiredCard when no user is signed in.
 * Renders the page normally once the user is authenticated.
 *
 * TO CONNECT SUPABASE:
 *   - No changes needed here. Once useCurrentUser() returns a real AuthUser,
 *     the gate lifts automatically and the wrapped page is shown.
 */
function ProtectedRoute({
  component: Page,
  feature,
}: {
  component: ComponentType;
  feature: GatedFeature;
}) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthRequiredCard feature={feature} />;
  }

  return (
    <DisplayNamePromptGate>
      <Page />
    </DisplayNamePromptGate>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public routes — always accessible */}
      <Route path="/" component={HomeRoute} />
      <Route path="/location" component={LocationPage} />
      <Route path="/jurisdiction/:state/:county" component={JurisdictionPage} />
      <Route path="/custody-map" component={CustodyMapPage} />
      <Route path="/custody-laws/:stateSlug" component={CustodyLawsStatePage} />
      <Route path="/custody-questions/:slug" component={CustodyQuestionsPage} />
      <Route path="/q/:stateSlug/:topic/:slug" component={PublicQAPage} />
      <Route path="/privacy" component={PrivacyPolicyPage} />
      <Route path="/terms" component={TermsOfServicePage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/redeem" component={RedeemCodePage} />
      <Route path="/billing/success" component={BillingSuccessPage} />
      <Route path="/billing/cancel" component={BillingCancelPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/users" component={AdminPage} />

      {/* Gated routes — require authentication */}
      <Route path="/ask">
        {() => <ProtectedRoute component={AskAIPage} feature="ask-ai" />}
      </Route>
      <Route path="/resources">
        {() => <ProtectedRoute component={ResourcesPage} feature="ask-ai" />}
      </Route>
      <Route path="/upload-document">
        {() => <ProtectedRoute component={UploadDocumentPage} feature="analyze-document" />}
      </Route>
      <Route path="/analyze">
        {() => <ProtectedRoute component={UploadDocumentPage} feature="analyze-document" />}
      </Route>
      <Route path="/workspace">
        {() => <ProtectedRoute component={WorkspacePage} feature="workspace" />}
      </Route>
      <Route path="/workspace/documents">
        {() => <ProtectedRoute component={WorkspacePage} feature="workspace" />}
      </Route>
      <Route path="/case/:caseId">
        {() => <ProtectedRoute component={CaseDashboardPage} feature="workspace" />}
      </Route>
      <Route path="/document/:documentId">
        {() => <ProtectedRoute component={DocumentDetailPage} feature="workspace" />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function FullPageLoading() {
  return (
    <div className="flex-1 flex items-center justify-center py-24">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function HomeRoute() {
  const { user, isLoading: isAuthLoading } = useCurrentUser();
  const [location] = useLocation();
  const hasPriorAuthHint =
    typeof window !== "undefined" &&
    window.sessionStorage.getItem("custody-atlas:auth-user-id") !== null;

  const { data: hasDocuments, isLoading: isWorkspaceLoading } = useQuery({
    queryKey: ["/api/workspace", "home-redirect"],
    enabled: Boolean(user),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/workspace");
      if (!res.ok) return true; // Fallback to workspace when workspace data is unavailable.
      const json = await res.json() as { documents?: unknown[] };
      return Array.isArray(json.documents) && json.documents.length > 0;
    },
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (isAuthLoading || !user || isWorkspaceLoading) return;
    const destination = hasDocuments ? "/workspace" : "/analyze";
    if (location !== destination) {
      window.location.replace(destination);
    }
  }, [hasDocuments, isAuthLoading, isWorkspaceLoading, location, user]);

  if (isAuthLoading || (user && isWorkspaceLoading) || (!user && hasPriorAuthHint)) {
    return <FullPageLoading />;
  }

  if (user) {
    return <FullPageLoading />;
  }

  return <LandingPage />;
}

function App() {
  const { user, isLoading } = useCurrentUser();
  const { data: usage } = useQuery({
    queryKey: ["/api/usage", "analytics-identify", user?.id ?? "anon"],
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
    queryFn: fetchUsageState,
  });
  const authKey = isLoading ? "loading" : user ? user.id : "unauthenticated";

  useEffect(() => {
    if (!user) return;
    identifyUser(user.id, {
      email: user.email ?? undefined,
      tier: usage?.tier ?? user.tier ?? "free",
    });
  }, [user, usage?.tier]);

  return (
    <ThemeProvider>
      <TooltipProvider>
        <ScrollToTop />
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 flex flex-col min-h-0">
            <div key={authKey} className="flex-1 flex flex-col min-h-0">
              <Router />
            </div>
          </main>
          <AppFooter />
        </div>
        <OnboardingModal />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
