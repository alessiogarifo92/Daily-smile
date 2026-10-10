import { dayNumber } from './dates';
import type { Lang } from './i18n';

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

/** English daily messages: written to sound natural in English, not word-for-word translations. */
export const MESSAGES_EN: readonly string[] = [
  'Be as kind to yourself today as you are to the people you love. You deserve every bit of it.',
  'You don’t have to be perfect, just present. The rest blooms in its own time.',
  'A small step is still a step forward.',
  'You’ve made it through hard days before. This one will find you stronger than you think.',
  'Breathe. There’s time. Lovely things are never in a hurry.',
  'Someone will smile today because of you, even if they never say so.',
  'Take a pause: flowers grow in quiet moments too.',
  'The way you are is a gift. Don’t forget it.',
  'Pick one thing to do well today. That’s enough.',
  'It’s fine not to have every answer. Enjoy the question for now.',
  'You carry more light than any grey day.',
  'Remember to drink a glass of water and look up at the sky.',
  'Kindness always finds its way back, sometimes as flowers.',
  'You don’t have to earn your rest. It’s already yours.',
  'Every morning is a blank page: write something sweet on it.',
  'Smile at the first person you meet. It might be you, in the mirror.',
  'Your small wins count. Celebrate them.',
  'Let go of one heavy thing today and make room for flowers.',
  'You’re exactly where you need to be to begin.',
  'The world is a better place with you in it.',
  'Do something you love today, even just for ten minutes.',
  'Courage isn’t having no fear. It’s taking the step anyway.',
  'One bad day is not a bad life.',
  'You deserve the same patience you give everyone else.',
  'Even the sun takes a cloudy day now and then.',
  'Look how far you’ve come. Really, take a look.',
  'Some people are happy simply because you exist.',
  'Say yes to one lovely thing today.',
  'Your gentle heart is your greatest strength.',
  'Stop for a moment and smell the flowers. These ones are for you.',
  'Don’t compare your beginning with someone else’s middle.',
  'You are enough. You always have been.',
  'A coffee, a song, a kind thought: the day can begin.',
  'Hold on to one thing that makes you say thank you today.',
  'Roots grow even when nobody can see them.',
  'Do something today for the person you’ll be tomorrow.',
  'Your laugh is contagious. Spread it around.',
  'It’s okay to ask for help. Even flowers need rain.',
  'Any day is a good day to start again.',
  'You’re trying, and that is no small thing.',
  'Let today be light.',
  'The things you love are waiting for you. Go and visit them.',
  'Your worth doesn’t depend on how much you get done today.',
  'Send a message to someone you care about. It will make their day.',
  'Every petal falls in its own time, and so do heavy thoughts.',
  'You’re the right person to take on this day.',
  'Choose calm today. The rest will sort itself out.',
  'The people who love you see wonderful things in you. Try to see them too.',
  'Beautiful things often arrive without warning. Keep your eyes open.',
  'One thing at a time. With a smile, if you can.',
  'You are a small walking miracle.',
  'You have every right to be happy today too.',
  'Make peace with your own pace. It’s yours, and it’s just right.',
  'Hard days make the good ones sweeter.',
  'Your smile lights up more than you imagine.',
  'Look after yourself like a rare flower.',
  'Today the world needs exactly your light.',
  'It’s never too late for a good day.',
  'Remember: after every winter, spring always comes.',
  'This bouquet is a hug. Accept it.',
];

/**
 * Message of the day for a "YYYY-MM-DD" key. Walks the list with a stride coprime
 * to its length, so consecutive days never repeat and all messages are used
 * before any comes back.
 */
export function messageFor(dateKey: string, lang: Lang = 'it'): string {
  const list = lang === 'en' ? MESSAGES_EN : MESSAGES;
  const n = list.length;
  const stride = coprimeStride(n);
  const index = (((dayNumber(dateKey) * stride) % n) + n) % n;
  return list[index] as string;
}

function coprimeStride(n: number): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  for (let s = 17; s < n + 17; s++) if (gcd(s, n) === 1) return s;
  return 1;
}
