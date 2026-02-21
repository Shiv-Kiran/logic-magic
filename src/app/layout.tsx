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

const themeBootstrapScript = `
(() => {
  try {
    const key = "magiclogic-theme";
    const stored = window.localStorage.getItem(key);
    const theme = stored === "light" || stored === "dark" ? stored : "dark";
    document.documentElement.setAttribute("data-theme", theme);
  } catch {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

function resolveMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "https://magiclogic.shivkiranbagathi.com";
  try {
    return new URL(raw);
  } catch {
    return new URL("https://magiclogic.shivkiranbagathi.com");
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
    url: "/",
    siteName: "MagicLogic",
    images: [
      {
        url: "/img/MagicLogic.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "MagicLogic preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MagicLogic",
    description: "Logic IDE for True Math.",
    images: ["/img/MagicLogic.png"],
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${jetBrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
