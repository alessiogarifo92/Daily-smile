import { dayNumber } from './dates';

/** Daily messages: gentle, gender-neutral, no pressure. */
export const MESSAGES: readonly string[] = [
  'Oggi sii gentile con te, come lo sei con chi ami. Te lo meriti tutto.',
  'Non serve essere perfetti: basta esserci. Il resto, piano piano, fiorisce.',
  'Un passo piccolo è sempre un passo avanti.',
  'Hai già superato giornate difficili. Anche questa ti troverà più forte di quanto pensi.',
  'Respira. Hai tempo. Le cose belle non hanno fretta.',
  'Qualcuno, oggi, sorriderà grazie a te. Anche senza dirtelo.',
  'Concediti una pausa: anche i fiori crescono nei momenti di quiete.',
  'Il tuo modo di essere è un regalo. Non dimenticarlo.',
  'Oggi scegli una cosa sola da fare bene. Basta quella.',
  'Va bene non avere tutte le risposte. Intanto, goditi la domanda.',
  'Hai più luce tu di qualsiasi giornata grigia.',
  'Ricordati di bere un bicchiere d’acqua e di guardare il cielo.',
  'La gentilezza che dai torna sempre indietro, a volte sotto forma di fiori.',
  'Non devi meritarti il riposo. È già tuo.',
  'Ogni mattina è una pagina bianca: scrivi qualcosa di dolce.',
  'Sorridi alla prima persona che incontri. Magari sei tu, allo specchio.',
  'Le tue piccole vittorie contano. Festeggiale.',
  'Oggi lascia andare una cosa che pesa. Fai spazio ai fiori.',
  'Sei esattamente dove devi essere per iniziare.',
  'Il mondo è un posto migliore perché ci sei tu.',
  'Fai una cosa che ti piace, anche solo per dieci minuti.',
  'Il coraggio non è non avere paura: è fare un passo lo stesso.',
  'Una giornata storta non è una vita storta.',
  'Oggi meriti la stessa pazienza che hai con gli altri.',
  'Anche il sole, a volte, si prende una giornata di nuvole.',
  'Guarda quanta strada hai fatto. Davvero, guardala.',
  'Ci sono persone felici solo perché esisti.',
  'Oggi prova a dire di sì a una cosa bella.',
  'Il tuo cuore gentile è la tua forza più grande.',
  'Fermati un attimo e annusa i fiori. Questi sono per te.',
  'Non confrontare il tuo inizio con la metà di qualcun altro.',
  'Sei abbastanza. Lo sei sempre.',
  'Un caffè, una canzone, un bel pensiero: la giornata può cominciare.',
  'Tieni stretta una cosa che oggi ti fa dire grazie.',
  'Le radici crescono anche quando non si vedono.',
  'Oggi fai qualcosa per la persona che sarai domani.',
  'La tua risata è contagiosa. Spargila in giro.',
  'Va bene chiedere aiuto. Anche i fiori hanno bisogno di pioggia.',
  'Ogni giorno è un buon giorno per ricominciare.',
  'Ci stai provando, e non è poco: è già tantissimo.',
  'Lascia che oggi sia leggero.',
  'Le cose che ami ti stanno aspettando. Vai a trovarle.',
  'Il tuo valore non dipende da quanto produci oggi.',
  'Manda un messaggio a qualcuno a cui vuoi bene. Ne sarà felice.',
  'Ogni petalo cade al suo tempo. Anche i pensieri pesanti.',
  'Sei la persona giusta per affrontare questa giornata.',
  'Oggi scegli la calma. Il resto si sistema.',
  'Chi ti vuole bene vede in te cose bellissime. Prova a vederle anche tu.',
  'Il bello arriva spesso senza preavviso. Tieni gli occhi aperti.',
  'Una cosa alla volta. Con il sorriso, se puoi.',
  'Sei un piccolo miracolo che cammina.',
  'Anche oggi hai il diritto di essere felice.',
  'Fai pace con i tuoi ritmi: sono i tuoi, e vanno benissimo.',
  'I giorni difficili rendono più dolci quelli belli.',
  'Il tuo sorriso illumina più di quanto immagini.',
  'Prenditi cura di te come di un fiore raro.',
  'Oggi il mondo ha bisogno proprio della tua luce.',
  'Non è mai troppo tardi per una bella giornata.',
  'Ricorda: dopo ogni inverno arriva sempre la primavera.',
  'Questo bouquet è un abbraccio. Accettalo.',
];

/**
 * Message of the day for a "YYYY-MM-DD" key. Walks the list with a stride coprime
 * to its length, so consecutive days never repeat and all messages are used
 * before any comes back.
 */
export function messageFor(dateKey: string): string {
  const n = MESSAGES.length;
  const stride = coprimeStride(n);
  const index = (((dayNumber(dateKey) * stride) % n) + n) % n;
  return MESSAGES[index] as string;
}

function coprimeStride(n: number): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  for (let s = 17; s < n + 17; s++) if (gcd(s, n) === 1) return s;
  return 1;
}
