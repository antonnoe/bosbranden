// Wat er een keer verloopt, op één plek.
//
// Deze tool leest overheidsbronnen met sleutels en abonnementen die elk hun
// eigen klok hebben. Verloopt er één, dan valt een module stil zonder dat er
// iets aan de code mankeert, en in de logs ziet dat eruit als een 401 of een
// TLS-fout. /api/status/vervaldata leest dit bestand uit zodat een monitor er
// alarm op kan zetten, in plaats van dat iemand het toevallig moet opmerken.
//
// De abonnementsdata zijn op 03-09-2026 rechtstreeks afgelezen van het
// ingelogde API-portaal van Météo-France, onder "My API" bij DefaultApplication.
// Ze stonden alle drie op "In progress". Let op het datumformaat in het
// portaal: dat is dd/mm/jjjj, dus 10/07/2028 is juli 2028 en niet oktober.
//
// DRIE KLOKKEN, NIET TWEE. Naast het abonnement hieronder en de eigen looptijd
// van de sleutel (JWT-claim exp) is er een derde: een sleutel dekt alleen de
// API's waarop de applicatie geabonneerd was op het moment dat de sleutel werd
// gegenereerd. Dat is geen theorie — het is precies waarop de Vigilance-koppeling
// eerst een 403 gaf, terwijl het abonnement al sinds 10-08-2026 op dezelfde
// applicatie stond als Forest weather. Na élke nieuwe subscription hoort er dus
// een nieuwe sleutel gegenereerd en in Vercel gezet te worden, ook als het
// abonnement er "al" is en er niets lijkt te zijn veranderd.

export interface Abonnement {
  // Naam zoals de catalogus van het portaal hem toont.
  naam: string;
  // Technische naam uit de catalogus-URL, of null wanneer die niet is afgelezen.
  technischeNaam: string | null;
  // Applicatie waaronder het abonnement hangt.
  applicatie: string;
  limietPerMinuut: number;
  // Einddatum van het abonnement (ISO, alleen de datum).
  eindigtOp: string;
  // Waar het abonnement voor wordt gebruikt, of null als het (nog) nergens
  // voor wordt gebruikt.
  gebruiktDoor: string | null;
}

export const AFGELEZEN_OP = "2026-09-03";
export const PORTAAL_APPLICATIE = "DefaultApplication";

export const ABONNEMENTEN: Abonnement[] = [
  {
    naam: "Vigilance Bulletin",
    technischeNaam: "DonneesPubliquesVigilance",
    applicatie: PORTAAL_APPLICATIE,
    limietPerMinuut: 60,
    eindigtOp: "2028-07-10",
    gebruiktDoor: "/api/vigilance",
  },
  {
    naam: "Forest weather",
    technischeNaam: "DPMeteoForets",
    applicatie: PORTAAL_APPLICATIE,
    limietPerMinuut: 100,
    eindigtOp: "2028-07-07",
    gebruiktDoor: "/api/danger",
  },
  {
    naam: "Climatological data",
    technischeNaam: null,
    applicatie: PORTAAL_APPLICATIE,
    limietPerMinuut: 100,
    eindigtOp: "2028-07-10",
    gebruiktDoor: null,
  },
];
