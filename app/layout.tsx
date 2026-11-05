import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Rental House Manager",
  title: {
    default: "Rental House Manager",
    template: "%s | Rental House Manager",
  },
  description:
    "Track rent and water bills offline, and request owner-authenticated M-Pesa rent payments.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1219" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
