import type { Metadata, Viewport } from "next";
import "./globals.css";
import Zijlade from "@/components/Zijlade";

const TITEL =
  "Weer en waarschuwingen Frankrijk — brandgevaar, warmtebronnen en rookverplaatsing";
const OMSCHRIJVING =
  "Nederlandstalige tool voor Frankrijk (métropole, incl. Corsica): het verwachte " +
  "bosbrandgevaar per departement, recente satellietmetingen van warmtebronnen, de " +
  "berekende rookverplaatsing en officiële waarschuwingen. Met postcode-check en " +
  "klikbare kaart. Bronnen: Météo-France, NASA FIRMS, Open-Meteo en FR-Alert.";

// De publicatie-URL verschilt per omgeving (Vercel-domein of eigen domein); via
// env in te stellen zodat gedeelde links een absolute URL krijgen.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bosbranden.nederlanders.fr";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITEL,
  description: OMSCHRIJVING,
  // Anton plaatst favicon.ico en apple-touch-icon.png zelf in public/ via de
  // GitHub-webeditor; de metadata verwijst er alvast naar.
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  // Open Graph zodat een gedeelde link op WhatsApp of Facebook fatsoenlijk oogt.
  openGraph: {
    type: "website",
    locale: "nl_NL",
    siteName: "Weer en waarschuwingen Frankrijk",
    title: TITEL,
    description: OMSCHRIJVING,
    url: SITE_URL,
  },
  twitter: {
    card: "summary",
    title: TITEL,
    description: OMSCHRIJVING,
  },
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
