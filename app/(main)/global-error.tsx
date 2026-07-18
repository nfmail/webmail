"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Global error boundary for the root layout.
 *
 * IMPORTANT: Strings in this file CANNOT be translated.
 * This global error boundary renders outside the root layout and has no access
 * to providers (including next-intl). This is a Next.js limitation for
 * catastrophic error handling. These English strings only appear during
 * critical failures when the entire app crashes.
 *
 * The component must render its own <html> and <body> tags as it replaces
 * the root layout entirely.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-muted">
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Something went wrong
            </h1>
            <p className="text-muted-foreground mb-6">
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4 me-2" />
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
