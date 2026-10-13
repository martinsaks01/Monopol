/*
 * Standardtema: «Norgesreisen»
 *
 * Et tema beskriver ALT innhold i spillet: felter, fargegrupper, kortstokker og regler.
 * Lag ditt eget ved å kopiere denne fila, eller last ned temaet som JSON fra startskjermen,
 * endre det og importer det igjen. Se README.md for hele formatet.
 */
import type { Theme } from '../game/types';

const theme: Theme = {
  id: 'norgesreisen',
  name: 'Norgesreisen',
  description: 'Reis fra Vardø til Oslo og kjøp opp landet.',

  // Regler som overstyrer standardreglene i motoren (kan også endres på startskjermen).
  rules: {
    startMoney: 1500,
    goSalary: 200,
    jailFine: 50,
    currency: 'kr',
  },

  // Fargegrupper for eiendommer. houseCost = pris per hus (hotell koster det samme).
  groups: {
    brun:     { name: 'Brun',      color: '#8b5a2b', houseCost: 50 },
    lysblaa:  { name: 'Lyseblå',   color: '#9fd3f0', houseCost: 50 },
    rosa:     { name: 'Rosa',      color: '#d9469b', houseCost: 100 },
    oransje:  { name: 'Oransje',   color: '#f39221', houseCost: 100 },
    rod:      { name: 'Rød',       color: '#e0312f', houseCost: 150 },
    gul:      { name: 'Gul',       color: '#f5d10c', houseCost: 150 },
    gronn:    { name: 'Grønn',     color: '#1f9d55', houseCost: 200 },
    moerkblaa:{ name: 'Mørkeblå',  color: '#1b4fa0', houseCost: 200 },
  },

  /*
   * Brettet. Antall felter må være delelig med 4 (standard: 40).
   * Felt 0 er alltid Start. Hjørnene ligger på 0, n/4, n/2 og 3n/4.
   *
   * Felttyper:
   *   start      – Start (lønn når man passerer)
   *   property   – eiendom: group, price, rent: [uten hus, 1, 2, 3, 4 hus, hotell]
   *   station    – stasjon/jernbane: price (leie fra rules.stationRent)
   *   utility    – verk: price (leie = terningsum × rules.utilityMultipliers)
   *   tax        – skatt: amount
   *   card       – trekk kort: deck (id i «decks»)
   *   jail       – fengsel / på besøk
   *   parking    – gratis parkering
   *   gotojail   – gå i fengsel
   * Valgfritt på alle felter: icon (emoji som vises på brettet).
   * Valgfritt på alle kjøpbare felter: mortgage (pantverdi, standard = halv pris).
   */
  board: [
    { type: 'start', name: 'Start' },
    { type: 'property', name: 'Vardø', group: 'brun', price: 60, rent: [2, 10, 30, 90, 160, 250] },
    { type: 'card', name: 'Prøv lykken', deck: 'lykken' },
    { type: 'property', name: 'Hammerfest', group: 'brun', price: 60, rent: [4, 20, 60, 180, 320, 450] },
    { type: 'tax', name: 'Inntektsskatt', amount: 200 },
    { type: 'station', name: 'Ofotbanen', price: 200 },
    { type: 'property', name: 'Kirkenes', group: 'lysblaa', price: 100, rent: [6, 30, 90, 270, 400, 550] },
    { type: 'card', name: 'Sjanse', deck: 'sjanse' },
    { type: 'property', name: 'Alta', group: 'lysblaa', price: 100, rent: [6, 30, 90, 270, 400, 550] },
    { type: 'property', name: 'Harstad', group: 'lysblaa', price: 120, rent: [8, 40, 100, 300, 450, 600] },
    { type: 'jail', name: 'Fengsel' },
    { type: 'property', name: 'Mo i Rana', group: 'rosa', price: 140, rent: [10, 50, 150, 450, 625, 750] },
    { type: 'utility', name: 'Kraftverket', price: 150, icon: '⚡' },
    { type: 'property', name: 'Narvik', group: 'rosa', price: 140, rent: [10, 50, 150, 450, 625, 750] },
    { type: 'property', name: 'Bodø', group: 'rosa', price: 160, rent: [12, 60, 180, 500, 700, 900] },
    { type: 'station', name: 'Dovrebanen', price: 200 },
    { type: 'property', name: 'Gjøvik', group: 'oransje', price: 180, rent: [14, 70, 200, 550, 750, 950] },
    { type: 'card', name: 'Prøv lykken', deck: 'lykken' },
    { type: 'property', name: 'Hamar', group: 'oransje', price: 180, rent: [14, 70, 200, 550, 750, 950] },
    { type: 'property', name: 'Lillehammer', group: 'oransje', price: 200, rent: [16, 80, 220, 600, 800, 1000] },
    { type: 'parking', name: 'Gratis parkering' },
    { type: 'property', name: 'Kristiansund', group: 'rod', price: 220, rent: [18, 90, 250, 700, 875, 1050] },
    { type: 'card', name: 'Sjanse', deck: 'sjanse' },
    { type: 'property', name: 'Molde', group: 'rod', price: 220, rent: [18, 90, 250, 700, 875, 1050] },
    { type: 'property', name: 'Ålesund', group: 'rod', price: 240, rent: [20, 100, 300, 750, 925, 1100] },
    { type: 'station', name: 'Bergensbanen', price: 200 },
    { type: 'property', name: 'Fredrikstad', group: 'gul', price: 260, rent: [22, 110, 330, 800, 975, 1150] },
    { type: 'property', name: 'Drammen', group: 'gul', price: 260, rent: [22, 110, 330, 800, 975, 1150] },
    { type: 'utility', name: 'Vannverket', price: 150, icon: '💧' },
    { type: 'property', name: 'Kristiansand', group: 'gul', price: 280, rent: [24, 120, 360, 850, 1025, 1200] },
    { type: 'gotojail', name: 'Gå i fengsel' },
    { type: 'property', name: 'Stavanger', group: 'gronn', price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
    { type: 'property', name: 'Trondheim', group: 'gronn', price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
    { type: 'card', name: 'Prøv lykken', deck: 'lykken' },
    { type: 'property', name: 'Bergen', group: 'gronn', price: 320, rent: [28, 150, 450, 1000, 1200, 1400] },
    { type: 'station', name: 'Sørlandsbanen', price: 200 },
    { type: 'card', name: 'Sjanse', deck: 'sjanse' },
    { type: 'property', name: 'Tromsø', group: 'moerkblaa', price: 350, rent: [35, 175, 500, 1100, 1300, 1500] },
    { type: 'tax', name: 'Luksusskatt', amount: 100 },
    { type: 'property', name: 'Oslo', group: 'moerkblaa', price: 400, rent: [50, 200, 600, 1400, 1700, 2000] },
  ],

  /*
   * Kortstokker. Hvert kort har en tekst og en effekt («action»):
   *   { action: 'advance', to: 24 }                       – gå til felt (får lønn hvis man passerer Start)
   *   { action: 'advance', to: 0 }                        – gå til Start
   *   { action: 'nearest', target: 'station', rentMultiplier: 2 }  – nærmeste stasjon, dobbel leie
   *   { action: 'nearest', target: 'utility', diceMultiplier: 10 } – nærmeste verk, 10 × terningene
   *   { action: 'back', steps: 3 }                        – gå tilbake
   *   { action: 'money', amount: 50 }                     – motta (positiv) eller betal (negativ)
   *   { action: 'payEach', amount: 50 }                   – betal hver medspiller
   *   { action: 'collectEach', amount: 10 }               – motta fra hver medspiller
   *   { action: 'repairs', house: 25, hotel: 100 }        – betal per hus/hotell
   *   { action: 'jail' }                                  – gå i fengsel
   *   { action: 'jailCard' }                              – kom-ut-av-fengsel-kort (beholdes)
   */
  decks: {
    sjanse: {
      name: 'Sjanse',
      color: '#f39221',
      icon: '❓',
      cards: [
        { text: 'Gå videre til Start. Motta 200 kr.', action: 'advance', to: 0 },
        { text: 'Ta en helgetur til Oslo.', action: 'advance', to: 39 },
        { text: 'Reis til Ålesund. Passerer du Start, mottar du 200 kr.', action: 'advance', to: 24 },
        { text: 'Reis til Mo i Rana. Passerer du Start, mottar du 200 kr.', action: 'advance', to: 11 },
        { text: 'Gå til nærmeste stasjon. Er den eid, betaler du dobbel leie.', action: 'nearest', target: 'station', rentMultiplier: 2 },
        { text: 'Gå til nærmeste stasjon. Er den eid, betaler du dobbel leie.', action: 'nearest', target: 'station', rentMultiplier: 2 },
        { text: 'Gå til nærmeste verk. Er det eid, kaster du terningene og betaler 10 ganger summen.', action: 'nearest', target: 'utility', diceMultiplier: 10 },
        { text: 'Banken betaler deg et utbytte på 50 kr.', action: 'money', amount: 50 },
        { text: 'Kom ut av fengsel gratis. Kortet kan beholdes til det trengs, eller selges.', action: 'jailCard' },
        { text: 'Gå tilbake tre felt.', action: 'back', steps: 3 },
        { text: 'Gå direkte i fengsel. Du passerer ikke Start og mottar ikke 200 kr.', action: 'jail' },
        { text: 'Generelle reparasjoner: betal 25 kr per hus og 100 kr per hotell.', action: 'repairs', house: 25, hotel: 100 },
        { text: 'Fartsbot! Betal 15 kr.', action: 'money', amount: -15 },
        { text: 'Ta en tur med Ofotbanen. Passerer du Start, mottar du 200 kr.', action: 'advance', to: 5 },
        { text: 'Du er valgt til styreleder. Betal hver spiller 50 kr.', action: 'payEach', amount: 50 },
        { text: 'Byggelånet ditt forfaller. Motta 150 kr.', action: 'money', amount: 150 },
      ],
    },
    lykken: {
      name: 'Prøv lykken',
      color: '#4aa3df',
      icon: '🍀',
      cards: [
        { text: 'Gå videre til Start. Motta 200 kr.', action: 'advance', to: 0 },
        { text: 'Feil i banken i din favør. Motta 200 kr.', action: 'money', amount: 200 },
        { text: 'Legeregning. Betal 50 kr.', action: 'money', amount: -50 },
        { text: 'Du selger aksjer og tjener 50 kr.', action: 'money', amount: 50 },
        { text: 'Kom ut av fengsel gratis. Kortet kan beholdes til det trengs, eller selges.', action: 'jailCard' },
        { text: 'Gå direkte i fengsel. Du passerer ikke Start og mottar ikke 200 kr.', action: 'jail' },
        { text: 'Feriepengene kommer. Motta 100 kr.', action: 'money', amount: 100 },
        { text: 'Skatteoppgjøret gir penger tilbake. Motta 20 kr.', action: 'money', amount: 20 },
        { text: 'Det er bursdagen din! Motta 10 kr fra hver spiller.', action: 'collectEach', amount: 10 },
        { text: 'Livsforsikringen utbetales. Motta 100 kr.', action: 'money', amount: 100 },
        { text: 'Sykehusregning. Betal 100 kr.', action: 'money', amount: -100 },
        { text: 'Betal skolepenger på 50 kr.', action: 'money', amount: -50 },
        { text: 'Du får et konsulenthonorar på 25 kr.', action: 'money', amount: 25 },
        { text: 'Veiarbeid foran eiendommene dine: betal 40 kr per hus og 115 kr per hotell.', action: 'repairs', house: 40, hotel: 115 },
        { text: 'Du vant andrepremie i en sangkonkurranse. Motta 10 kr.', action: 'money', amount: 10 },
        { text: 'Du arver 100 kr.', action: 'money', amount: 100 },
      ],
    },
  },
};

export default theme;
