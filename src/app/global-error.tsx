"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#fbfaf7",
          color: "#111318",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: "24px" }}>
          <div style={{ maxWidth: "600px", textAlign: "center" }}>
            <p style={{ margin: 0, color: "#721c24", fontSize: "14px", fontWeight: 700 }}>PGSMS</p>
            <h1 style={{ margin: "12px 0 0", fontSize: "clamp(32px, 6vw, 48px)", lineHeight: 1.05 }}>
              We could not load the application.
            </h1>
            <p
              style={{
                margin: "20px auto 0",
                color: "#5f6065",
                fontSize: "16px",
                lineHeight: 1.7,
              }}
            >
              Try again now. If the problem continues, return to the homepage and sign in again.
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "12px",
                marginTop: "28px",
              }}
            >
              <button
                type="button"
                onClick={reset}
                style={{
                  minHeight: "44px",
                  border: 0,
                  borderRadius: "8px",
                  background: "#721c24",
                  color: "white",
                  cursor: "pointer",
                  padding: "0 20px",
                  fontWeight: 700,
                }}
              >
                Try again
              </button>
              <Link
                href="/"
                style={{
                  display: "inline-flex",
                  minHeight: "42px",
                  alignItems: "center",
                  border: "1px solid #111318",
                  borderRadius: "8px",
                  color: "#111318",
                  padding: "0 20px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Return home
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
