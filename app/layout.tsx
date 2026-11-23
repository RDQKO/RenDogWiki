// =============================================
// File: app/layout.tsx
// (전체 코드)
// - 기존 metadata / viewport / Analytics 유지
// - 전역 AuthProvider 추가
// - 다크모드 초기화 스크립트 추가
// =============================================

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "@/wiki/css/fonts-kor.css";
import { Analytics } from "@vercel/analytics/react";
import logoImg from "./image/logo.png";
import AuthProvider from "@/components/auth/AuthProvider";
import ImageReplacementProvider from "@/components/image/ImageReplacementProvider";
import { getImageManifest } from "@/wiki/lib/imageReplacementStore";
import "./wiki/css/header.css";

export const dynamic = "force-dynamic";

// NOTE: 배포 도메인을 환경변수로 설정하면 메타데이터/OG에 반영됩니다.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wiki.example.com";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RenDog Wiki",
    template: "%s | RenDog Wiki",
  },
  description: "렌독 RPG 비공식 위키",
  applicationName: "RenDog Wiki",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "RenDog Wiki",
    title: "RenDog Wiki",
    description: "렌독 RPG 비공식 위키",
    locale: "ko_KR",
    images: [
      {
        url: logoImg.src,
        width: logoImg.width,
        height: logoImg.height,
        alt: "RenDog Wiki",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RenDog Wiki",
    description: "렌독 RPG 비공식 위키",
    images: [logoImg.src],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  appleWebApp: {
    capable: true,
    title: "RenDog Wiki",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const imageManifest = await getImageManifest();
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={inter.className}>
        <Script id="rdwiki-theme-init" strategy="beforeInteractive">
          {`
            (function () {
              try {
                var STORAGE_KEY = 'rdwiki-theme';
                var saved = window.localStorage.getItem(STORAGE_KEY);
                var theme =
                  saved === 'light' || saved === 'dark'
                    ? saved
                    : 'light';

                var root = document.documentElement;
                root.dataset.theme = theme;
                root.style.colorScheme = theme;
              } catch (e) {}
            })();
          `}
        </Script>

        <AuthProvider>
          <ImageReplacementProvider initialAliases={imageManifest.aliases} initialVariants={imageManifest.variants}>{children}</ImageReplacementProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
