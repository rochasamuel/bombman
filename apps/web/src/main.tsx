import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { syncMotionClass } from "./store/ui";
import "./index.css";

syncMotionClass();

// No StrictMode: its double-invoked effects would join and leave every room twice.
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <App />
  </QueryClientProvider>,
);
