import type React from "react";
import type { Metadata } from "next";
import { Fira_Code, Rajdhani, Space_Grotesk } from "next/font/google";
import { Toaster } from "@/components/ui";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap"
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  variable: "--font-rajdhani",
  weight: ["500", "600", "700"],
  display: "swap"
});

// Monospace for data: fixed-width digits keep ports, IDs, and ticking
// countdowns from jittering as their characters change.
const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "The Kage Protocol",
  description: "CTF challenge command center"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${rajdhani.variable} ${firaCode.variable}`}>
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="fixed inset-0 bg-noise pointer-events-none z-0" />
        <div className="fixed inset-0 bg-radial pointer-events-none z-0" />
        <div className="relative z-10">{children}</div>
        <Toaster />
      </body>
    </html>
  );
}
