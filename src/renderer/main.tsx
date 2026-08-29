/**
 * Purpose: Entry point for the React application, responsible for rendering the App component into the root DOM element.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installDebugTools } from "./utils/debugTools";
import "./index.css";

installDebugTools(import.meta.env.DEV, window);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </ErrorBoundary>,
);
