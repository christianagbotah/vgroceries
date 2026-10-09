import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Variety Groceries — Fresh groceries for Ghanaian homes",
    template: "%s · Variety Groceries",
  },
  description:
    "Shop fresh produce, grains, household essentials and more from Variety Groceries (varietygrocery.com). Delivery across Accra and in-store collection. Demo storefront prototype.",
  keywords: ["groceries", "Ghana", "Accra", "online grocery", "Variety Groceries", "delivery", "collection"],
  applicationName: "Variety Groceries",
  openGraph: {
    title: "Variety Groceries",
    description: "Fresh groceries for Ghanaian homes — delivery and collection (demo storefront).",
    siteName: "Variety Groceries",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2d5a3d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
