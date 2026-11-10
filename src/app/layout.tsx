import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";
// Cormorant Garamond has no Greek glyphs; EB Garamond (Greek subset only) fills in.
import "@fontsource/eb-garamond/greek-400.css";
import "@fontsource/eb-garamond/greek-500.css";
import "@fontsource/eb-garamond/greek-600.css";
import "@fontsource/eb-garamond/greek-700.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./globals.css";

const TITLE = "Ordavo — QR ordering for bars and beach bars";
const DESCRIPTION =
  "Guests scan a QR code on the table or sunbed, choose from a menu with photos and tap Send. The order appears on a phone or tablet behind the bar. Free 3-week pilot for bars, beach bars and tavernas.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "https://ordavo.vercel.app"),
  title: { default: TITLE, template: "%s · Ordavo" },
  description: DESCRIPTION,
  applicationName: "Ordavo",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Ordavo",
    title: TITLE,
    description: DESCRIPTION,
    // image comes from src/app/opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0d0b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
