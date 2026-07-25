import type { Metadata, Viewport } from "next";
import "./globals.css";

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
        <style>{`
          body label:has(> input[type="checkbox"]) {
            flex-wrap: wrap;
          }

          body label:has(> input[type="checkbox"])::after {
            content: "Nodig voor ‘Alle hittebronnen’ en ‘Waarschijnlijke natuurbranden’. ‘Officieel gemeld’ werkt zonder dit vinkje.";
            display: block;
            flex: 0 0 100%;
            margin-left: 25px;
            max-width: 640px;
            color: rgba(51, 39, 39, 0.72);
            font-size: 0.75rem;
            font-weight: 400;
            line-height: 1.4;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
