# Hub

Een eenvoudige persoonlijke webapp met een vaste sidebar, eigen pagina’s en een aanpasbare Home. De naam is de productnaam: je eigen naam komt uit je profiel. Ieder account krijgt zijn eigen gegevens.

Dit is een werkende eerste versie met Next.js, TypeScript, Tailwind CSS, Supabase, dnd-kit, Tiptap en Recharts. De database en externe accounts configureer je zelf. Er zitten geen voorbeeldgegevens of accounts in de app.

## Wat zit erin?

| Onderdeel | Eerste versie                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account   | Registreren met naam, e-mail en wachtwoord, e-mail bevestigen, inloggen, uitloggen                                                                       |
| Home      | Widgets toevoegen, verwijderen, verslepen en smal/breed maken; indeling bewaren per gebruiker                                                            |
| Mail      | Eén Gmail-account per gebruiker koppelen, metadata synchroniseren, categorieën en belangrijk-markering aanpassen, filteren, openen in Gmail, ontkoppelen |
| Money     | Handmatig inkomsten en uitgaven invoeren, maand kiezen, bedragen en grafiek bekijken, betalingen bijhouden                                               |
| Calendar  | Eigen afspraken toevoegen, chronologisch bekijken en verwijderen                                                                                         |
| Tasks     | Taken met optionele deadline toevoegen, afronden, heropenen en verwijderen                                                                               |
| Space     | Pagina’s maken en bewaren; tekst, koppen, lijsten, vet, cursief, citaten en undo                                                                         |
| Files     | Privébestanden uploaden, downloaden en verwijderen; maximaal 4 MB per bestand                                                                            |
| Settings  | Naam, tijdzone en munt kiezen                                                                                                                            |

Het systeem verstuurt nog geen pushmeldingen. De widget **Aandacht nodig** toont belangrijke ongelezen mails, betalingen vandaag of te laat, en verlopen taken. Er is nog geen bankkoppeling, Google Calendar-sync, AI, automatische factuurherkenning, bestandsbewerking, geneste pagina-interface of volledige Notion-blokeditor.

## 1. Project starten op je Mac

Gebruik Node.js 22 LTS of nieuwer en npm. Controleer eerst:

```bash
node -v
npm -v
```

Installeer Node via [nodejs.org](https://nodejs.org/) als het ontbreekt. Je hebt geen globale Next.js-, Supabase- of TypeScript-installatie nodig.

Zet `teynur-os.zip` in Downloads. Open Terminal en voer uit:

```bash
cd ~/Downloads
unzip teynur-os.zip
cd teynur-os
npm ci
cp .env.example .env.local
```

Als je de ZIP al via Finder hebt uitgepakt, sla `unzip` over en open die uitgepakte map in Terminal.

**Je hoeft geen nieuw create-next-app-project te maken. Dit project bevat al alle bestanden.**

## 2. Supabase instellen

1. Maak een nieuw project op [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor** en maak een nieuwe query.
3. Kopieer de volledige inhoud van `supabase/migrations/202610020001_initial.sql` in die query en voer deze één keer uit op je lege project. Dit maakt ook de private `documents`-bucket.
4. Open de projectinstellingen voor API/keys. Kopieer de **Project URL** en **publishable key** naar `.env.local`. Gebruik geen service-role-key op een `NEXT_PUBLIC_`-variabele.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://jouw-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=jouw-publishable-key
APP_URL=http://localhost:3000
```

5. Ga naar **Authentication → URL Configuration**. Stel lokaal Site URL in op `http://localhost:3000` en voeg `http://localhost:3000/auth/confirm` toe aan de toegestane redirect-URLs.
6. Ga naar de e-mailtemplate voor **Confirm signup**. Gebruik als bevestigingslink:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
  >Bevestig je e-mailadres</a
>
```

7. E-mail/wachtwoordlogin moet aan staan. E-mailbevestiging mag aan blijven. Supabase kan voor het versturen van bevestigingsmails eigen SMTP-instellingen vereisen, vooral voor andere gebruikers. Configureer een mailprovider als bevestigingsmails niet aankomen.
8. Herstart je ontwikkelserver als je `.env.local` aanpast.

Deze migratie is voor een **nieuw** project. Niet opnieuw uitvoeren als de tabellen al bestaan. Er wordt geen service-role-key gebruikt voor normale appgegevens; alle toegang daarvoor loopt via de ingelogde gebruiker en RLS.

## 3. De app openen

Terminal 1, vanuit de projectmap:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Maak een account met je eigen naam, bevestig je e-mail en log in. Heb je de Supabase-variabelen nog niet ingevuld, dan toont de app eerst een instelpagina.

**Eén draaiende terminal volstaat voor de app.** Supabase draait extern, er is geen aparte Express-server. Laat deze terminal open; stoppen kan met `Ctrl+C`.

## 4. Gmail koppelen (optioneel, nadat de basis werkt)

De overige modules werken zonder Gmail. Accountregistratie via Supabase en Gmail koppelen zijn twee afzonderlijke stappen. Je kunt een ander Gmail-adres koppelen dan het adres waarmee je inlogt.

1. Maak een project in [Google Cloud Console](https://console.cloud.google.com/).
2. Activeer **Gmail API**.
3. Configureer de OAuth consent screen / Google Auth Platform. Voor persoonlijk testen: External, Testing en voeg jezelf toe als testgebruiker.
4. Voeg deze scope toe bij Data Access:

```text
https://www.googleapis.com/auth/gmail.metadata
```

5. Maak een **OAuth client ID → Web application**.
6. Voeg deze exacte Authorized redirect URI toe:

```text
http://localhost:3000/api/gmail/callback
```

7. Kopieer de client ID en client secret naar `.env.local`.
8. Kopieer de server-only **service_role** key uit Supabase naar `SUPABASE_SERVICE_ROLE_KEY`. Deze sleutel is alleen nodig voor de afgeschermde Gmail-tokenopslag; zet hem nooit in frontendcode.
9. Genereer een encryptiesleutel in een tweede terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

10. Plak het resultaat bij `TOKEN_ENCRYPTION_KEY`. Bewaar deze sleutel: bestaande verbindingen kunnen niet worden ontsleuteld als je hem vervangt. Deel je `.env.local` niet en commit hem niet.

Je Gmail-variabelen zien er zo uit:

```dotenv
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=jouw-client-id
GOOGLE_CLIENT_SECRET=jouw-client-secret
SUPABASE_SERVICE_ROLE_KEY=jouw-service-role-key
TOKEN_ENCRYPTION_KEY=jouw-gegenereerde-sleutel
```

11. Stop en herstart `npm run dev`.
12. Open **Mail → Gmail koppelen**. Kies je Google-account en geef toegang.
13. Klik op **Synchroniseren**.

### Hoe de Gmail-versie werkt

- Synchroniseren controleert maximaal de laatste **50 inboxmails**. Het is geen volledige import van je mailbox. Opgeslagen oudere mails blijven in de app; archiveren/verwijderen in Gmail wordt nog niet gespiegeld.
- De app haalt alleen headers en labels op, geen mailbody of bijlagen. De Gmail-scope is `gmail.metadata`, niet `gmail.modify`.
- Alleen afzender, onderwerp, datum, categorie, belangrijk-markering, ongelezen-status en Gmail-ID worden opgeslagen.
- Eenvoudige regels gebruiken onderwerp, afzender en Gmail-labels. Dit is een eerste categorisatie, geen AI. Niet elke mail kan correct herkend worden. Categorie **Werk** of **Persoonlijk** kan je bijvoorbeeld handmatig kiezen.
- Je eigen categorieën en belangrijk-markeringen blijven bij volgende synchronisaties behouden.
- Mails worden niet verstuurd, verwijderd, gelezen gemarkeerd of verplaatst in Gmail. Je opent de inhoud via **Open in Gmail**.
- Google refresh tokens zijn versleuteld met AES-256-GCM, inclusief binding aan het gebruikers-ID. De token-tabel is voor normale gebruikers helemaal ontoegankelijk.
- Bij ontkoppelen wordt Google-toegang ingetrokken en worden opgeslagen mailgegevens verwijderd. Bij koppelen van een ander Gmail-adres worden de mails van het vorige adres verwijderd.
- In Google's testmodus kan je toestemming verlopen en moet je opnieuw koppelen. Een testapp is geen onbeperkt publieke Gmail-integratie.

`gmail.metadata` is een restricted scope. Voor openbaar gebruik moet je de toepasselijke Google-verificatie en security assessment afhandelen, omdat deze app metadata op een server bewaart. De vereisten hangen af van je gebruik en eventuele uitzonderingen. Minder opslaan verandert de scope-classificatie niet. Zie [Gmail-scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) en [Google OAuth voor webservers](https://developers.google.com/identity/protocols/oauth2/web-server).

## 5. Structuur

```text
teynur-os/
├── src/
│   ├── app/
│   │   ├── (workspace)/          # Beveiligde routes en app-layout
│   │   │   ├── home/
│   │   │   ├── mail/
│   │   │   ├── money/
│   │   │   ├── calendar/
│   │   │   ├── tasks/
│   │   │   ├── space/[id]/
│   │   │   ├── files/
│   │   │   └── settings/
│   │   ├── api/                 # Gmail-callback en private downloads
│   │   ├── auth/confirm/
│   │   ├── login/
│   │   ├── setup/
│   │   └── globals.css          # Rustige UI; hier kun je styling aanpassen
│   ├── components/              # Sidebar en gedeelde formulieren
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/           # Widgetconfig, UI en layoutopslag
│   │   ├── mail/                # OAuth, encryptie, synchronisatie en regels
│   │   ├── money/               # Grafiek
│   │   ├── calendar/
│   │   ├── space/               # Editor en pagina-acties
│   │   ├── files/               # Upload- en verwijderacties
│   │   └── data/                # Queries en gedeelde CRUD-acties
│   ├── lib/                     # Types, validatie, formatting en Supabase
│   └── proxy.ts                 # Auth-cookieverversing
├── supabase/migrations/         # Tabellen, constraints, triggers en RLS
├── tests/                       # Bedragen, classificatie, encryptie en RLS
├── .env.example
├── package.json
└── README.md
```

Next.js verzorgt de interface én serverlogica. Acties controleren de ingelogde gebruiker opnieuw. De database controleert het eigenaarschap onafhankelijk daarvan. De sidebar is alleen navigatie; de beveiliging zit niet alleen in de layout of proxy.

### Verder bouwen

- Nieuwe module: voeg een route toe onder `(workspace)`, maak een feature-map en voeg de menuoptie toe in `src/components/sidebar.tsx`.
- Nieuwe widget: voeg het type toe aan `lib/types.ts`, `lib/validation.ts`, `features/dashboard/config.ts` en de inhoud in `dashboard.tsx`.
- Nieuwe tabel: maak een **nieuwe migratie** met `user_id`, foreign keys, indexes en eigen RLS-policy. Wijzig geen al uitgevoerde migratie.
- Eigen styling: `src/app/globals.css` en de individuele componenten. Tailwind is geconfigureerd; de basis gebruikt leesbare CSS-klassen zodat je de UI gemakkelijk kunt vervangen.
- Databasetypes later genereren: `npx supabase gen types typescript --project-id JOUW_PROJECT_ID > src/lib/database.types.ts`. Koppel die types vervolgens aan de clients. De huidige app gebruikt centrale domeintypes en servervalidatie.

## 6. Meerdere gebruikers

Hub is van bij de start gebouwd voor meerdere accounts:

- Naam, tijdzone, munt en widgetindeling horen bij een profiel.
- Elke module bewaart gegevens met een `user_id`.
- RLS beperkt lezen, toevoegen, aanpassen en verwijderen tot de eigenaar.
- Bestanden zitten in een private bucket onder `user_id/unieke-bestands-id`.
- Foreign keys voor pagina- en bestandsrelaties bevatten ook `user_id`. Een link naar een pagina van een andere gebruiker wordt geweigerd.
- Gmail-verbindingen horen bij één account; token-toegang loopt alleen server-side.
- Er zit geen hardgecodeerde naam, persoonlijk loon, bankgegeven of mailadres in de gebruikersdata.

Deze versie ondersteunt geen delen/samenwerken. Dat vraagt aparte rechten en policies; zet RLS daarvoor niet uit.

Voor een publieke uitrol zijn account recovery, accountverwijdering/data-export, privacyinformatie, betrouwbare SMTP, monitoring en Google's integratiegoedkeuring nog vervolgstappen. Het project is een eerste functionele versie, geen volledig afgewerkt SaaS-product.

## 7. Controlecommando’s

Terminal 2, in dezelfde projectmap:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

De database-tests gebruiken een lokale PostgreSQL-engine via PGlite. Ze voeren de echte migratie uit tegen een kleine vervanging van Supabase's auth/storage-tabellen en testen twee accounts. Je hebt daarvoor geen Docker of eigen Supabase-sleutel nodig. Ze vervangen geen volledige integratietest met een live Supabase-project.

De code is gecontroleerd met TypeScript, ESLint, een productiebuild en 34 tests. Een echte Supabase-registratie, storage-upload en Gmail OAuth-flow moet je na configuratie controleren met je eigen accounts.

Om je productiebuild lokaal te starten, stop eerst de devserver en voer uit:

```bash
npm run build
npm start
```

## 8. Later op Vercel

1. Zet de projectmap in je eigen Git-repository; laat `.env.local` buiten Git.
2. Importeer die repository in [Vercel](https://vercel.com/).
3. Voeg de omgevingsvariabelen toe via de projectinstellingen.
4. Stel `APP_URL` in op de vaste HTTPS-URL van je app.
5. Pas Supabase Site URL, auth redirect URLs en de Google OAuth redirect URI aan voor dat domein.
6. Gebruik de vaste app-URL voor Gmail. Previewdeployments hebben niet automatisch dezelfde OAuth-callback.
7. Uploads zijn beperkt tot 4 MB zodat ze binnen de huidige Vercel-requestlimiet passen. Voor grotere bestanden kun je later rechtstreeks naar Supabase Storage uploaden vanuit de browser. Zie [Vercel-limieten](https://vercel.com/docs/functions/limitations).

Er is in dit pakket niets automatisch gepubliceerd en geen extern account aangemaakt.

## Afspraken van deze eerste versie

- Bedragen zijn positieve gehele centen; inkomsten/uitgaven worden met een aparte `kind` opgeslagen. Geen afrondfouten door optellen van floats.
- Eén munt per profiel, zonder wisselkoersconversie. Het maandoverzicht is het verschil tussen ingevoerde transacties, geen werkelijk banksaldo.
- **Betaald** markeren maakt nog geen uitgavetransactie. Registreer die zelf apart. Zo worden bedragen niet onbedoeld dubbel geteld.
- Pagina’s hebben een expliciete **Bewaren**-knop. De app waarschuwt bij verlaten met onopgeslagen wijzigingen. Er is nog geen autosave, versiegeschiedenis of conflictoplossing tussen twee tabs.
- Bestandsopslag en de bestandsregistratie zijn twee operaties. Bij mislukte registratie probeert de app de upload op te ruimen. Voor productie hoort hier periodieke controle op eventuele verweesde bestanden bij.
- Calendar-invoer gebruikt de tijdzone van je apparaat; tijden worden als UTC bewaard en in je profiel-tijdzone getoond.
- Lijsten worden in batches opgehaald om Supabase's standaardresultaatlimiet niet stilzwijgend te gebruiken. De MVP stopt met een fout bij 20.000 items per module/maand. Voeg voor grotere volumes paginering en database-aggregaties toe.
- Gmail synchroniseert op aanvraag; er is nog geen achtergrondjob, Gmail watch/Pub/Sub of push.

Gebruikte technische documentatie: [Next.js-auth](https://nextjs.org/docs/app/guides/authentication), [Supabase server-side auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Supabase storage policies](https://supabase.com/docs/guides/storage/security/access-control), [Tiptap met Next.js](https://tiptap.dev/docs/editor/getting-started/install/nextjs).
