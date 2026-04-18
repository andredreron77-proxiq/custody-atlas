import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import "./index.css";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
