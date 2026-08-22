import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppFrame } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Quill",
  description: "Campus timetable, papers, and assessment — in one workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark", geist.variable)}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <AppFrame>
          <Suspense fallback={<Skeleton className="m-8 h-64 rounded-xl" />}>{children}</Suspense>
        </AppFrame>
      </body>
    </html>
  );
}
