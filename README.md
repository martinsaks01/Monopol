# Monopol

Et nettleserbasert eiendomsspill inspirert av Monopol og de digitale versjonene av det. Det er laget i ren HTML, CSS og JavaScript, så du trenger verken byggesteg, server eller installasjon.

## Kom i gang

Åpne `index.html` i en nettleser. Det er alt.

(Vil du heller kjøre via en lokal server, går for eksempel `python3 -m http.server` og deretter http://localhost:8000 fint.)

## Funksjoner

- **2–8 spillere**: mennesker på samme skjerm (hot-seat) og/eller datamotstandere (AI)
- **Komplett regelsett**
  - kjøp av eiendommer, stasjoner og verk
  - leie, og dobbel leie når man eier hele fargegruppen
  - hus og hoteller med jevn bygging og et begrenset antall bygninger i banken
  - pantsetting og innløsning (10 % rente)
  - **auksjon** når en eiendom ikke blir kjøpt
  - **handel** mellom spillere: eiendommer, penger og kom-ut-av-fengsel-kort
  - fengsel: betal bot, bruk kort eller slå dobbel. Tre doble på rad sender deg i fengsel
  - Sjanse- og Prøv lykken-kort med ulike effekter
  - gjeld og konkurs: eiendelene går til kreditoren eller tilbake til banken
- **Husregler** du kan slå av og på: pott på Gratis parkering, dobbel lønn på Start, auksjoner, jevn bygging, startpenger og mer
- **Datamotstandere** som kjøper, byr på auksjoner, bygger, pantsetter, betaler seg ut av fengsel og foreslår og vurderer handler
- **Automatisk lagring** i nettleseren. Du kan også laste ned spillet som en fil og laste det inn igjen
- Animerte terninger og brikker, logg over hendelser, skjøter (eiendomskort) og justerbar hastighet
- **Egne temaer**: lag ditt eget brett med egne felter, priser, grupper, kort og regler

## Lage eget brett, egne felter og kort

Alt innhold ligger i et **tema**. Standardtemaet «Norgesreisen» ligger i `themes/standard.js`.

**Enkleste vei:** Velg temaet på startskjermen, trykk **«Last ned som JSON»**, rediger fila og importer den igjen med **«Importer tema»**. Importerte temaer lagres i nettleseren.

**Permanent tema i koden:** Kopier `themes/standard.js` til for eksempel `themes/mitt-tema.js`, gi det en ny `id` og et nytt `name`, og legg til en linje i `index.html`:

```html
<script src="themes/mitt-tema.js"></script>
```

### Temaformat

```js
{
  id: 'mitt-tema',
  name: 'Mitt tema',
  description: 'Kort beskrivelse',
  rules: { startMoney: 1500, goSalary: 200, currency: 'kr' },   // valgfritt
  groups: {
    brun: { name: 'Brun', color: '#8b5a2b', houseCost: 50 },
    // ...
  },
  board: [ /* felter, se under */ ],
  decks: {
    sjanse: { name: 'Sjanse', color: '#f39221', icon: '❓', cards: [ /* kort */ ] },
  },
}
```

### Felter (`board`)

Antall felter må være delelig med 4 (standard er 40), og felt 0 må være Start. Hjørnene ligger på felt 0, n/4, n/2 og 3n/4.

| Type        | Eksempel                                                                 |
|-------------|---------------------------------------------------------------------------|
| `start`     | `{ type: 'start', name: 'Start' }`                                        |
| `property`  | `{ type: 'property', name: 'Oslo', group: 'moerkblaa', price: 400, rent: [50, 200, 600, 1400, 1700, 2000] }` |
| `station`   | `{ type: 'station', name: 'Dovrebanen', price: 200 }`                     |
| `utility`   | `{ type: 'utility', name: 'Vannverket', price: 150, icon: '💧' }`         |
| `tax`       | `{ type: 'tax', name: 'Inntektsskatt', amount: 200 }`                     |
| `card`      | `{ type: 'card', name: 'Sjanse', deck: 'sjanse' }`                        |
| `jail`      | `{ type: 'jail', name: 'Fengsel' }`                                       |
| `parking`   | `{ type: 'parking', name: 'Gratis parkering' }`                           |
| `gotojail`  | `{ type: 'gotojail', name: 'Gå i fengsel' }`                              |

`rent` for eiendommer er leien uten hus, med 1, 2, 3 og 4 hus, og med hotell (6 tall).
Valgfrie felt på alle felter er `icon` (en emoji). På kjøpbare felter kan du i tillegg sette `mortgage` (pantverdi), `houseCost` (overstyrer gruppen) og `rent` på stasjoner og verk (overstyrer reglene).

### Kort (`decks.*.cards`)

| Effekt                                                         | Betydning                                     |
|----------------------------------------------------------------|-----------------------------------------------|
| `{ action: 'advance', to: 24 }`                                | Gå til felt 24 (lønn hvis du passerer Start)  |
| `{ action: 'nearest', target: 'station', rentMultiplier: 2 }`  | Gå til nærmeste stasjon og betal dobbel leie  |
| `{ action: 'nearest', target: 'utility', diceMultiplier: 10 }` | Gå til nærmeste verk og betal 10 × terningene |
| `{ action: 'back', steps: 3 }`                                 | Gå tilbake 3 felt                             |
| `{ action: 'move', steps: 5 }`                                 | Gå 5 felt fram                                |
| `{ action: 'money', amount: 50 }` / `amount: -50`              | Motta eller betal                             |
| `{ action: 'payEach', amount: 50 }`                            | Betal hver medspiller                         |
| `{ action: 'collectEach', amount: 10 }`                        | Motta fra hver medspiller                     |
| `{ action: 'repairs', house: 25, hotel: 100 }`                 | Betal per hus og per hotell                   |
| `{ action: 'jail' }`                                           | Gå i fengsel                                  |
| `{ action: 'jailCard' }`                                       | Kom-ut-av-fengsel-kort                        |

Hvert kort har også en `text` som vises når kortet trekkes.

### Regler (`rules`)

Alle reglene kan settes i temaet. Mange av dem kan også endres på startskjermen.

| Regel                    | Standard           | Beskrivelse                                         |
|--------------------------|--------------------|-----------------------------------------------------|
| `startMoney`             | 1500               | Startpenger                                         |
| `goSalary`               | 200                | Lønn når man passerer Start                         |
| `doubleSalaryOnGo`       | false              | Dobbel lønn når man lander rett på Start            |
| `jailFine`               | 50                 | Bot for å komme ut av fengsel                       |
| `maxJailTurns`           | 3                  | Antall forsøk på å slå dobbel                       |
| `doublesToJail`          | 3                  | Antall doble på rad som sender deg i fengsel        |
| `freeParkingJackpot`     | false              | Skatter og bøter samles i en pott                   |
| `auctions`               | true               | Auksjon når en eiendom ikke kjøpes                  |
| `evenBuild`              | true               | Hus må bygges jevnt i en gruppe                     |
| `houses` / `hotels`      | 32 / 12            | Antall bygninger i banken                           |
| `mortgageInterest`       | 0.1                | Rente ved innløsning                                |
| `buildingSellRate`       | 0.5                | Andel av byggeprisen man får ved salg av hus        |
| `monopolyRentMultiplier` | 2                  | Faktor for grunnleie når man eier hele gruppen      |
| `stationRent`            | [25, 50, 100, 200] | Leie etter antall stasjoner man eier                |
| `utilityMultipliers`     | [4, 10]            | Terningfaktor etter antall verk man eier            |
| `collectRentInJail`      | true               | Om man kan kreve leie mens man sitter i fengsel     |
| `currency`               | 'kr'               | Valutategn                                          |

## Struktur

```
index.html          Siden
css/style.css       Utseende
js/engine.js        Spillmotoren: alle regler, ren logikk uten DOM
js/ai.js            Datamotstanderen
js/ui.js            Grensesnitt: brett, dialoger, animasjoner og lagring
themes/standard.js  Standardtemaet (felter, kort og regler)
test/               Regeltester og simulering av AI-mot-AI-spill
```

Motoren er skilt fra grensesnittet, så den kan testes i Node og senere gjenbrukes, for eksempel til flerspiller over nett.

## Tester

```
node test/rules.test.js     # målrettede regeltester
node test/simulate.js 300   # simulerer 300 AI-spill og sjekker at alt henger sammen
```

## Mulige videre steg

- Visuell editor for temaer i nettleseren
- Flerspiller over nett (motoren er klar for det, siden tilstanden er ren JSON)
- Lyd og flere animasjoner
- Flere AI-nivåer
- Tidsbegrenset spill
