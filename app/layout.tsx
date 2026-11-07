import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/700.css";

import "./globals.css";

export const metadata: Metadata = {
  title: "AblePay",
  description: "Voice-native accessibility-first payment agent"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
