import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { CallNotificationBanner } from "@/components/CallNotificationBanner";
import { MessageNotificationBanner } from "@/components/MessageNotificationBanner";
import { SITE_CONFIG } from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_TITLE = "HustleClickGH — Get paid to power AI in Ghana";
const SITE_DESCRIPTION = "Earn money by contributing voice recordings, surveys, and language data for AI training. Record in English, Twi, Ga, Hausa and get paid instantly via Mobile Money.";

// Link previews (WhatsApp, Facebook, X, LinkedIn…). The share image itself is
// app/opengraph-image.jpg + app/twitter-image.jpg; icons are app/favicon.ico,
// app/icon.png and app/apple-icon.png (Next.js file conventions).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.url),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "HustleClickGH",
  openGraph: {
    type: "website",
    siteName: "HustleClickGH",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_CONFIG.url,
    locale: "en_GH",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
          <CallNotificationBanner />
          <MessageNotificationBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
