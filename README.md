# Monopol 3D

Et eiendomsspill i 3D, inspirert av Monopol. Det kjører i nettleseren på PC, mobil og iPad.

**Dette er med:**
- 3D-brett med terninger som triller med ekte fysikk
- brikker som hopper fra felt til felt
- partikkeleffekter og lydeffekter
- datamotstandere
- XP, nivåer, prestasjoner og ting du kan låse opp

## Spille

**På nett:** Når GitHub Pages er slått på, publiseres spillet automatisk ved hver push. Se «Publisering» nedenfor.

**Lokalt:** Krever [Node.js](https://nodejs.org) 20 eller nyere.

```bash
npm install
npm run dev
```

Åpne adressen som vises (f.eks. http://localhost:5173). Med `--host` kan du også åpne spillet fra mobil eller iPad på samme nett.

## Funksjoner

**Spillet**
- Komplette regler:
  - kjøp, leie og hus/hotell med jevn bygging
  - pantsetting og auksjoner
  - handel med eiendommer, penger og fengselskort
  - fengsel, Sjanse- og Prøv lykken-kort
  - gjeld og konkurs
- **Spillmoduser:**
  - Klassisk
  - Hurtigspill: 2 eiendommer hver ved start, maks 40 turer, rikeste vinner
  - Egne regler
- **2–6 spillere:** mennesker på samme skjerm og/eller datamotstandere. Datamotstanderne kjøper, byr, bygger, pantsetter og foreslår handler.
- **Lagring:** spillet lagres automatisk og kan fortsettes senere. Det kan også lastes ned og inn som fil.

**3D og effekter**
- **Terninger:** de kastes fysisk (Rapier), og resultatet leses av fra siden som faktisk havner opp.
- **Brikker:** de hopper felt for felt og flyr til fengselet.
- **Kamera:** det følger handlingen. Dra for å rotere og klyp/scroll for å zoome.
- **Effekter:**
  - mynter når noen får penger
  - gnister ved kjøp
  - konfetti for komplette fargegrupper og seier
  - kortene snus med animasjon
- **Lyd:** syntetiserte lydeffekter og valgfri bakgrunnsmusikk. Ingen lydfiler trengs.

**Progresjon** (lagres lokalt per enhet)
- XP for kjøp, bygging, leie, handler, fargegrupper og seire
- 20 nivåer, 16 prestasjoner og statistikk
- Opplåsbare ting:
  - 8 brikker
  - 5 overflater (plast, metall, gull, glass, neon)
  - 4 terningsett
  - 4 bordmiljøer

## Lage eget brett, egne felter og kort

Alt innhold ligger i et **tema**. Standardtemaet «Norgesreisen» ligger i `src/themes/norgesreisen.ts`.

- **Uten koding:** Velg **Nytt spill**, trykk **Last ned JSON**, endre fila og importer den igjen med **Importer**.
- **I koden:** Kopier `norgesreisen.ts` og legg det nye temaet til i `src/themes/index.ts`.

### Felttyper

| Type       | Eksempel |
|------------|----------|
| `start`    | `{ type: 'start', name: 'Start' }` |
| `property` | `{ type: 'property', name: 'Oslo', group: 'moerkblaa', price: 400, rent: [50, 200, 600, 1400, 1700, 2000] }` |
| `station`  | `{ type: 'station', name: 'Dovrebanen', price: 200 }` |
| `utility`  | `{ type: 'utility', name: 'Vannverket', price: 150, icon: '💧' }` |
| `tax`      | `{ type: 'tax', name: 'Inntektsskatt', amount: 200 }` |
| `card`     | `{ type: 'card', name: 'Sjanse', deck: 'sjanse' }` |
| `jail`, `parking`, `gotojail` | `{ type: 'jail', name: 'Fengsel' }` |

**Regler for brettet:**
- Antall felter må være delelig med 4.
- Felt 0 må være Start.
- `rent` er leien uten hus, med 1–4 hus og med hotell (6 tall).

Fargegrupper defineres under `groups` med navn, farge og huspris.

### Korteffekter

| Effekt | Betydning |
|--------|-----------|
| `{ action: 'advance', to: 24 }` | Gå til felt 24 |
| `{ action: 'nearest', target: 'station', rentMultiplier: 2 }` | Nærmeste stasjon, dobbel leie |
| `{ action: 'nearest', target: 'utility', diceMultiplier: 10 }` | Nærmeste verk, 10 × terningene |
| `{ action: 'back', steps: 3 }` / `{ action: 'move', steps: 5 }` | Gå tilbake / fram |
| `{ action: 'money', amount: 50 }` | Motta (positivt) eller betal (negativt) |
| `{ action: 'payEach', amount: 50 }` / `collectEach` | Betal til / motta fra alle |
| `{ action: 'repairs', house: 25, hotel: 100 }` | Betal per hus og hotell |
| `{ action: 'jail' }` / `{ action: 'jailCard' }` | Fengsel / kom-ut-av-fengsel-kort |

## Struktur

```
src/game/       Spillmotor og AI. Ren logikk uten grafikk; tilstanden er ren JSON.
src/scene/      3D-scenen (React Three Fiber): brett, brikker, terninger, effekter og kamera.
src/store/      Felles tilstand, og regissøren som spiller av hendelser og styrer AI-en.
src/ui/         Menyer, HUD og dialoger.
src/progress/   XP, nivåer, prestasjoner og opplåsbare ting.
src/audio/      Syntetiserte lydeffekter.
src/themes/     Brett-temaer.
test/           Regeltester og simulering av 100 AI-spill.
```

Motoren sender ut en strøm av hendelser (kast, flytt, betal, kjøp …). Grafikk, lyd og XP-systemet reagerer på dem. Den samme strømmen kan senere sendes over nett for flerspiller.

## Utvikling

```bash
npm test          # regeltester og AI-simulering
npm run build     # typesjekk og produksjonsbygg i dist/
```

## Publisering (GitHub Pages)

`.github/workflows/deploy.yml` tester, bygger og publiserer ved hver push. Første gang må Pages slås på:

1. Gå til **Settings → Pages** i repoet på GitHub.
2. Under **Source**, velg **GitHub Actions**.

Spillet ligger da på `https://<brukernavn>.github.io/<repo>/`.
