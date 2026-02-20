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

export const metadata: Metadata = {
  title: "MagicLogic",
  description: "Logic IDE for transforming natural-language proofs into structured formal reasoning.",
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
