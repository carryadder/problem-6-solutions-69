import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Providers from "./providers";
import AppShell from "@/components/AppShell";

const siteUrl =
  process.env.NEXTAUTH_URL || process.env.FRONTEND_URL || "http://localhost:3002";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Gather | Private Social Conversations",
    template: "%s | Gather",
  },
  description:
    "A private social space for meaningful conversations, posts, profiles, and lightweight chat.",
  applicationName: "Gather",
  keywords: [
    "social app",
    "private social network",
    "chat app",
    "social posts",
    "community platform",
  ],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Gather",
    title: "Gather | Private Social Conversations",
    description:
      "A private social space for meaningful conversations, posts, profiles, and lightweight chat.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gather | Private Social Conversations",
    description:
      "A private social space for meaningful conversations, posts, profiles, and lightweight chat.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gaId = process.env.NEXT_PUBLIC_GTAG_ID;

  return (
    <html lang="en" suppressHydrationWarning className={jakarta.variable}>
      <head>
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        )}
      </head>
      <body className="min-h-screen antialiased bg-[#fbfbfa] text-slate-900 dark:bg-[#0A0A0A] dark:text-slate-100 font-sans selection:bg-rose-500/30">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
