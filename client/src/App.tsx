import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/app/Header";
import { Footer } from "@/components/app/Footer";
import { AuthRequiredCard } from "@/components/app/AuthRequiredCard";
import { useCurrentUser } from "@/hooks/use-auth";
import LandingPage from "@/pages/LandingPage";
import LocationPage from "@/pages/LocationPage";
import JurisdictionPage from "@/pages/JurisdictionPage";
import AskAIPage from "@/pages/AskAIPage";
import UploadDocumentPage from "@/pages/UploadDocumentPage";
import CustodyMapPage from "@/pages/CustodyMapPage";
import WorkspacePage from "@/pages/WorkspacePage";
import PrivacyPage from "@/pages/PrivacyPage";
import TermsPage from "@/pages/TermsPage";
import CustodyLawsStatePage from "@/pages/CustodyLawsStatePage";
import CustodyQuestionsPage from "@/pages/CustodyQuestionsPage";
import PublicQAPage from "@/pages/PublicQAPage";
import NotFound from "@/pages/not-found";
import type { ComponentType } from "react";

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

  return <Page />;
}

function Router() {
  return (
    <Switch>
      {/* Public routes — always accessible */}
      <Route path="/" component={LandingPage} />
      <Route path="/location" component={LocationPage} />
      <Route path="/jurisdiction/:state/:county" component={JurisdictionPage} />
      <Route path="/custody-map" component={CustodyMapPage} />
      <Route path="/custody-laws/:stateSlug" component={CustodyLawsStatePage} />
      <Route path="/custody-questions/:slug" component={CustodyQuestionsPage} />
      <Route path="/q/:stateSlug/:topic/:slug" component={PublicQAPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />

      {/* Gated routes — require authentication */}
      <Route path="/ask">
        {() => <ProtectedRoute component={AskAIPage} feature="ask-ai" />}
      </Route>
      <Route path="/upload-document">
        {() => <ProtectedRoute component={UploadDocumentPage} feature="analyze-document" />}
      </Route>
      <Route path="/workspace">
        {() => <ProtectedRoute component={WorkspacePage} feature="workspace" />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 flex flex-col min-h-0">
            <Router />
          </main>
          <Footer />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
