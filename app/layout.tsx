import type { Metadata, Viewport } from "next";
import "./globals.css";
import Zijlade from "@/components/Zijlade";

export const metadata: Metadata = {
  title: "Brandrisico Frankrijk — Météo des forêts per departement",
  description:
    "Bekijk het verwachte bosbrandgevaar in Frankrijk (métropole, incl. Corsica) voor morgen en overmorgen, per departement of via de kaart. Bron: Météo-France — Météo des forêts.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Mulish:ital,wght@0,400;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {/* Eén instantie van de uitschuifbare zijlade voor álle routes. */}
        <Zijlade />
      </body>
    </html>
  );
}
