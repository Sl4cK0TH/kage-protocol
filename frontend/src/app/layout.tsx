import type React from "react";
import type { Metadata } from "next";
import { Rajdhani, Space_Grotesk } from "next/font/google";
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
      <body className="bg-cyber min-h-screen text-slate-100">
        <div className="fixed inset-0 grid-overlay pointer-events-none" />
        {children}
      </body>
    </html>
  );
}
