import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Archivo has a width axis. The headline uses it to get wide, hull-lettering letterforms.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});

// Plex Mono is only used for commits, terminals and code.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-plex-mono",
});

const description =
  "shiplog reads the commits since your last post, drafts an update in your voice, and posts it from your own account once you approve it.";

export const metadata: Metadata = {
  title: "shiplog: turn your commits into posts",
  description,
  keywords: ["cli", "git", "commits", "changelog", "build in public", "developer tools"],
  authors: [{ name: "shiplog" }],
  robots: "index, follow",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "shiplog: turn your commits into posts",
    description,
    siteName: "shiplog",
  },
  twitter: {
    card: "summary",
    title: "shiplog: turn your commits into posts",
    description,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceee8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1622" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
