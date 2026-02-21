import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

function resolveMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "https://magiclogic.app";
  try {
    return new URL(raw);
  } catch {
    return new URL("https://magiclogic.app");
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: "MagicLogic",
    template: "%s | MagicLogic",
  },
  description: "Logic IDE for True Math.",
  openGraph: {
    title: "MagicLogic",
    description: "Logic IDE for True Math.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "MagicLogic",
    description: "Logic IDE for True Math.",
  },
  icons: {
    icon: [
      {
        url: "/magiclogic-icon.svg?v=1",
        type: "image/svg+xml",
      },
    ],
    shortcut: ["/magiclogic-icon.svg?v=1"],
    apple: ["/magiclogic-icon.svg?v=1"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="dark">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${jetBrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
