import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/app/Header";
import { Footer } from "@/components/app/Footer";
import LandingPage from "@/pages/LandingPage";
import LocationPage from "@/pages/LocationPage";
import JurisdictionPage from "@/pages/JurisdictionPage";
import AskAIPage from "@/pages/AskAIPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/location" component={LocationPage} />
      <Route path="/jurisdiction/:state/:county" component={JurisdictionPage} />
      <Route path="/ask" component={AskAIPage} />
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
          <main className="flex-1">
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
