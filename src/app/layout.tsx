import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";
import { SessionActivityTracker } from "@/components/auth/session-activity-tracker";

export const metadata: Metadata = {
  title: "PGSMS",
  description: "MPhil and PhD lifecycle management system",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <SessionActivityTracker />
        {children}
      </body>
    </html>
  );
}
