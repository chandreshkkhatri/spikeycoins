import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegistrar } from "@/components/layout/ServiceWorkerRegistrar";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spikey Coins | Trading Platform",
  description: "Multi-broker trading platform with real-time data",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ServiceWorkerRegistrar />
        <OfflineBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
