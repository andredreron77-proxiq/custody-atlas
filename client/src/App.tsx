import { Switch, Route, useLocation } from "wouter";
import React, { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/app/Header";
import { MinimalFooter } from "@/components/app/Footer";
import { ThemeProvider } from "@/components/app/ThemeProvider";
import { AuthRequiredCard } from "@/components/app/AuthRequiredCard";
import { DisplayNamePromptGate } from "@/components/app/DisplayNamePromptGate";
import { useCurrentUser } from "@/hooks/use-auth";
import { identifyUser } from "@/lib/analytics";
import { apiRequestRaw } from "@/lib/queryClient";
import { fetchUsageState, USAGE_QUERY_KEY } from "@/services/usageService";

import LandingPage from "@/pages/LandingPage";
import LocationPage from "@/pages/LocationPage";
import JurisdictionPage from "@/pages/JurisdictionPage";
import AskAIPage from "@/pages/AskAIPage";
import ResourcesPage from "@/pages/ResourcesPage";
import UploadDocumentPage from "@/pages/UploadDocumentPage";
import CustodyMapPage from "@/pages/CustodyMapPage";
import WorkspacePage from "@/pages/WorkspacePage";
import WelcomeFlow from "@/components/onboarding/WelcomeFlow";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import TermsOfServicePage from "@/pages/TermsOfServicePage";
import ContactPage from "@/pages/ContactPage";
import CustodyLawsStatePage from "@/pages/CustodyLawsStatePage";
import CustodyQuestionsPage from "@/pages/CustodyQuestionsPage";
import PublicQAPage from "@/pages/PublicQAPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import RedeemCodePage from "@/pages/RedeemCodePage";
import BillingSuccessPage from "@/pages/BillingSuccessPage";
import BillingCancelPage from "@/pages/BillingCancelPage";
import AccountPage from "@/pages/AccountPage";
import AttorneyDashboardPage from "@/pages/attorney/AttorneyDashboardPage";
import AttorneyClientPage from "@/pages/attorney/AttorneyClientPage";
import AdminPage from "@/pages/admin/AdminPage";
import CaseDashboardPage from "@/pages/CaseDashboardPage";
import DocumentDetailPage from "@/pages/DocumentDetailPage";
import NotFound from "@/pages/not-found";
import type { ComponentType } from "react";

function AppFooter() {
  return <MinimalFooter />;
}

class CustodyMapErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center">
          <p className="text-red-500 font-mono text-sm">
            {this.state.error.message}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
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
  const [location, navigate] = useLocation();
  const pathname = location.split("?")[0] || location;
  const { data: profile, isLoading: isProfileLoading } = useQuery<{ welcomeDismissedAt?: string | null; welcome_dismissed_at?: string | null; tier?: string | null } | null>({
    queryKey: ["/api/user-profile", user?.id ?? "anon", "welcome-gate"],
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/user-profile");
      if (!res.ok) return null;
      return res.json();
    },
  });
  const { data: casesData, isLoading: isCasesLoading } = useQuery<{ cases?: unknown[] }>({
    queryKey: ["/api/cases", user?.id ?? "anon", "welcome-gate"],
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/cases");
      if (!res.ok) return { cases: [] };
      return res.json();
    },
  });
  const welcomeDismissedAt = profile?.welcomeDismissedAt ?? profile?.welcome_dismissed_at ?? null;
  const isAttorneyFirmUser = profile?.tier === "attorney_firm";
  const shouldRedirectToWelcome =
    Boolean(user) &&
    !isProfileLoading &&
    !isAttorneyFirmUser &&
    !welcomeDismissedAt &&
    Array.isArray(casesData?.cases) &&
    casesData.cases.length === 0 &&
    pathname !== "/welcome";

  useEffect(() => {
    if (shouldRedirectToWelcome) {
      navigate("/welcome", { replace: true });
    }
  }, [navigate, shouldRedirectToWelcome]);

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

  if (isProfileLoading || shouldRedirectToWelcome) {
    return <FullPageLoading />;
  }

  return (
    <DisplayNamePromptGate>
      <Page />
    </DisplayNamePromptGate>
  );
}

function ProtectedWelcomeRoute() {
  const { user, isLoading } = useCurrentUser();
  const [, navigate] = useLocation();
  const skipWorkspaceRedirect = useRef(false);
  const welcomeFlowActive =
    typeof window !== "undefined" &&
    window.sessionStorage.getItem("custody-atlas:welcome-flow-active") === "1";
  const { data: profile, isLoading: isProfileLoading } = useQuery<{ welcomeDismissedAt?: string | null; welcome_dismissed_at?: string | null; tier?: string | null } | null>({
    queryKey: ["/api/user-profile", user?.id ?? "anon", "welcome-route"],
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/user-profile");
      if (!res.ok) return null;
      return res.json();
    },
  });
  const { data: casesData, isLoading: isCasesLoading, isFetching: isCasesFetching } = useQuery<{ cases?: unknown[] }>({
    queryKey: ["/api/cases", user?.id ?? "anon", "welcome-route"],
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/cases");
      if (!res.ok) return { cases: [] };
      return res.json();
    },
  });
  const welcomeDismissedAt = profile?.welcomeDismissedAt ?? profile?.welcome_dismissed_at ?? null;
  const isAttorneyFirmUser = profile?.tier === "attorney_firm";
  const shouldShowWelcome =
    Boolean(user) &&
    !isAttorneyFirmUser &&
    !welcomeDismissedAt &&
    Array.isArray(casesData?.cases) &&
    (casesData.cases.length === 0 || welcomeFlowActive);

  useEffect(() => {
    if (skipWorkspaceRedirect.current) return;
    if (!isLoading && user && !isProfileLoading && !isCasesFetching && !shouldShowWelcome && !welcomeFlowActive) {
      navigate("/workspace", { replace: true });
    }
  }, [isCasesFetching, isLoading, isProfileLoading, navigate, shouldShowWelcome, user, welcomeFlowActive]);

  if (isLoading) {
    return <FullPageLoading />;
  }

  if (!user) {
    return <AuthRequiredCard feature="workspace" />;
  }

  if (!shouldShowWelcome) {
    return <FullPageLoading />;
  }

  return <WelcomeFlow onNavigatingAway={() => {
    skipWorkspaceRedirect.current = true;
  }} />;
}

function Router() {
  return (
    <Switch>
      {/* Public routes — always accessible */}
      <Route path="/" component={HomeRoute} />
      <Route path="/location" component={LocationPage} />
      <Route path="/jurisdiction/:state/:county" component={JurisdictionPage} />
      <Route path="/custody-map">
        {() => (
          <CustodyMapErrorBoundary>
            <CustodyMapPage />
          </CustodyMapErrorBoundary>
        )}
      </Route>
      <Route path="/custody-laws/:stateSlug" component={CustodyLawsStatePage} />
      <Route path="/custody-questions/:slug" component={CustodyQuestionsPage} />
      <Route path="/q/:stateSlug/:topic/:slug" component={PublicQAPage} />
      <Route path="/privacy" component={PrivacyPolicyPage} />
      <Route path="/terms" component={TermsOfServicePage} />
      <Route path="/contact">
        {() => <ContactPage />}
      </Route>
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/redeem" component={RedeemCodePage} />
      <Route path="/billing/success" component={BillingSuccessPage} />
      <Route path="/billing/cancel" component={BillingCancelPage} />
      <Route path="/admin" component={AdminPage} />

      {/* Gated routes — require authentication */}
      <Route path="/welcome">
        {() => <ProtectedWelcomeRoute />}
      </Route>
      <Route path="/ask">
        {() => <ProtectedRoute component={AskAIPage} feature="ask-ai" />}
      </Route>
      <Route path="/resources" component={ResourcesPage} />
      <Route path="/upload-document">
        {() => <ProtectedRoute component={UploadDocumentPage} feature="analyze-document" />}
      </Route>
      <Route path="/analyze">
        {() => <AnalyzeRedirect />}
      </Route>
      <Route path="/workspace">
        {() => <ProtectedRoute component={WorkspacePage} feature="workspace" />}
      </Route>
      <Route path="/attorney/client/:clientUserId">
        {() => <ProtectedRoute component={AttorneyClientPage} feature="workspace" />}
      </Route>
      <Route path="/attorney">
        {() => <ProtectedRoute component={AttorneyDashboardPage} feature="workspace" />}
      </Route>
      <Route path="/account">
        {() => <ProtectedRoute component={AccountPage} feature="workspace" />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={AccountPage} feature="workspace" />}
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

function AnalyzeRedirect() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/upload-document", { replace: true });
  }, [navigate]);

  return <FullPageLoading />;
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
  const { data: profile, isLoading: isProfileLoading } = useQuery<{ welcomeDismissedAt?: string | null; welcome_dismissed_at?: string | null; tier?: string | null } | null>({
    queryKey: ["/api/user-profile", user?.id ?? "anon", "home-redirect"],
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/user-profile");
      if (!res.ok) return null;
      return res.json();
    },
  });
  const { data: casesData, isLoading: isCasesLoading } = useQuery<{ cases?: unknown[] }>({
    queryKey: ["/api/cases", user?.id ?? "anon", "home-redirect"],
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/cases");
      if (!res.ok) return { cases: [] };
      return res.json();
    },
  });

  useEffect(() => {
    if (isAuthLoading || !user || isWorkspaceLoading || isProfileLoading || isCasesLoading) return;
    const welcomeDismissedAt = profile?.welcomeDismissedAt ?? profile?.welcome_dismissed_at ?? null;
    const hasNoCases = Array.isArray(casesData?.cases) && casesData.cases.length === 0;
    const destination = profile?.tier === "attorney_firm"
      ? "/attorney"
      : !welcomeDismissedAt && hasNoCases
        ? "/welcome"
        : hasDocuments ? "/workspace" : "/analyze";
    if (location !== destination) {
      window.location.replace(destination);
    }
  }, [casesData?.cases, hasDocuments, isAuthLoading, isCasesLoading, isProfileLoading, isWorkspaceLoading, location, profile?.welcomeDismissedAt, profile?.welcome_dismissed_at, user]);

  if (isAuthLoading || (user && (isWorkspaceLoading || isProfileLoading || isCasesLoading)) || (!user && hasPriorAuthHint)) {
    return <FullPageLoading />;
  }

  if (user) {
    return <FullPageLoading />;
  }

  return <LandingPage />;
}

function App() {
  const { user, isLoading } = useCurrentUser();
  const [location] = useLocation();
  const { data: usage } = useQuery({
    queryKey: USAGE_QUERY_KEY,
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
    queryFn: fetchUsageState,
  });
  const authKey = isLoading ? "loading" : user ? user.id : "unauthenticated";
  const isAttorneyRoute = location === "/attorney" || location.startsWith("/attorney/");

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
          {!isAttorneyRoute ? <Header /> : null}
          <main className="flex-1 flex flex-col min-h-0">
            <div key={authKey} className="flex-1 flex flex-col min-h-0">
              <Router />
            </div>
          </main>
          {!isAttorneyRoute ? <AppFooter /> : null}
        </div>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
