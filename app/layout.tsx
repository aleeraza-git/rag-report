import type { Metadata } from "next";
import { JetBrains_Mono, Archivo, Newsreader } from "next/font/google";
import "./globals.css";

// Editorial serif for verdicts and section titles.
const serif = Newsreader({ subsets: ["latin"], weight: ["300","400","500","600"], style: ["normal","italic"], variable: "--font-serif" });
// Grotesque with real character for UI — deliberately not Inter.
const sans  = Archivo({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-sans" });
// Every figure in the product is set in mono for true tabular alignment.
const mono  = JetBrains_Mono({ subsets: ["latin"], weight: ["400","500","600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Estate Briefing — Imarat Group IT",
  description: "Facility reliability briefing and reporting for Imarat Group IT",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
