import type React from "react";
import type { Metadata } from "next";
import { Rajdhani, Space_Grotesk } from "next/font/google";
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

export const metadata: Metadata = {
  title: "The Kage Protocol",
  description: "CTF challenge command center"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${rajdhani.variable}`}>
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="fixed inset-0 bg-noise pointer-events-none z-0" />
        <div className="fixed inset-0 bg-radial pointer-events-none z-0" />
        <div className="relative z-10">{children}</div>
        <Toaster />
      </body>
    </html>
  );
}
