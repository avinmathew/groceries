import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { BASE_PATH } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MyGroceries",
  description: "A grocery shopping list app",
  manifest: "/groceries/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MyGroceries",
  },
  icons: {
    icon: "/groceries/icon-192x192.svg",
    apple: "/groceries/icon-192x192.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#99C556",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href={`${BASE_PATH}/apple-touch-icon.png`}/>
        <link rel="icon" type="image/png" sizes="32x32" href={`${BASE_PATH}/favicon-32x32.png`}/>
        <link rel="icon" type="image/png" sizes="16x16" href={`${BASE_PATH}/favicon-16x16.png`}/>
      </head>
      <body className={inter.className}>
        {children}
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
