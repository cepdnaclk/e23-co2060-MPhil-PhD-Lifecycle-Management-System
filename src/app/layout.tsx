import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "@/app/globals.css";
import { SessionActivityTracker } from "@/components/auth/session-activity-tracker";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "PGSMS",
  description: "MPhil and PhD lifecycle management system",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={cn("font-sans antialiased", inter.variable)}>
      <body className="min-h-screen bg-background text-foreground">
        <SessionActivityTracker />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
