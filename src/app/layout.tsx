import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { Providers } from "@/components/providers/Providers";
import "@/styles/globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Medicine Agent", template: "%s · Medicine Agent" },
  description: "Pharmaceutical export & trading management — Vexora Labs",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables live on <html> because the base `font-sans` rule is applied to <html>.
    // suppressHydrationWarning: next-themes sets the theme class on <html> before React hydrates.
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
