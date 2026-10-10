import type { FlowerColor, FlowerType } from '../flowers';

/**
 * Language of flowers, written for Daily Smile (research and sources on issue #16).
 * Traditional meanings from Kate Greenaway's "Language of Flowers" (1884) where it has an
 * entry, modern florist usage for colours; where sources disagree, the kindest common reading.
 */
export interface Meaning {
  it: string;
  en: string;
}

export const FLOWER_MEANINGS: Record<FlowerType, Meaning> = {
  rosa: {
    it: 'La rosa è da sempre il fiore dell’amore: dice che qualcuno ti tiene nel cuore.',
    en: 'The rose has always been the flower of love: it says someone keeps you close to their heart.',
  },
  tulipano: {
    it: 'Il tulipano porta un amore sincero e la gioia della primavera che ritorna.',
    en: 'The tulip carries heartfelt love and the joy of spring coming back.',
  },
  margherita: {
    it: 'La margherita parla di innocenza e di nuovi inizi, semplice come un sorriso.',
    en: 'The daisy speaks of innocence and fresh starts, simple as a smile.',
  },
  girasole: {
    it: 'Il girasole segue la luce: è il fiore dell’affetto fedele e dell’ammirazione.',
    en: 'The sunflower follows the light: it is the flower of loyal affection and admiration.',
  },
  peonia: {
    it: 'La peonia augura una vita felice e prospera: in Cina è la regina dei fiori.',
    en: 'The peony wishes you a happy, prosperous life: in China it is the queen of flowers.',
  },
  lavanda: {
    it: 'La lavanda porta serenità e un affetto devoto, calmo come il suo profumo.',
    en: 'Lavender brings serenity and devoted affection, calm as its scent.',
  },
  ranuncolo: {
    it: 'Il ranuncolo ha un messaggio antico e semplice: sei raggiante di fascino.',
    en: 'The ranunculus has an old, simple message: you are radiant with charm.',
  },
  gerbera: {
    it: 'La gerbera è pura allegria: un fiore che ti augura una giornata luminosa.',
    en: 'The gerbera is pure cheerfulness: a flower that wishes you a bright day.',
  },
};

/** One meaning per colour each flower really comes in (`REAL_COLORS`); lavender keeps its own colour. */
export const COLOR_MEANINGS: Record<Exclude<FlowerType, 'lavanda'>, Partial<Record<FlowerColor, Meaning>>> = {
  rosa: {
    corallo: {
      it: 'Le rose corallo esprimono entusiasmo e la voglia di condividere qualcosa di bello.',
      en: 'Coral roses express enthusiasm and the wish to share something lovely.',
    },
    sole: {
      it: 'Le rose gialle sono quelle dell’amicizia e della gioia di stare insieme.',
      en: 'Yellow roses stand for friendship and the joy of being together.',
    },
    magenta: {
      it: 'Le rose magenta dicono grazie: gratitudine e stima sincera.',
      en: 'Magenta roses say thank you: gratitude and heartfelt esteem.',
    },
    cipria: {
      it: 'Le rose rosa cipria parlano di grazia e di un affetto dolce e gentile.',
      en: 'Powder-pink roses speak of grace and sweet, gentle affection.',
    },
    rosso: {
      it: 'Le rose rosse sono la dichiarazione d’amore per eccellenza.',
      en: 'Red roses are the classic declaration of love.',
    },
    lilla: {
      it: 'Le rose lilla raccontano l’incanto, come un colpo di fulmine.',
      en: 'Lilac roses tell of enchantment, like love at first sight.',
    },
    pesca: {
      it: 'Le rose pesca esprimono riconoscenza e sincerità.',
      en: 'Peach roses express appreciation and sincerity.',
    },
    panna: {
      it: 'Le rose bianche parlano di purezza e di un nuovo inizio.',
      en: 'White roses speak of purity and new beginnings.',
    },
  },
  tulipano: {
    corallo: {
      it: 'I tulipani corallo portano energia, entusiasmo e calore.',
      en: 'Coral tulips bring energy, enthusiasm and warmth.',
    },
    sole: {
      it: 'I tulipani gialli dicono: c’è il sole nel tuo sorriso.',
      en: 'Yellow tulips say: there’s sunshine in your smile.',
    },
    magenta: {
      it: 'I tulipani magenta raccontano un affetto vivace e premuroso.',
      en: 'Magenta tulips tell of lively, caring affection.',
    },
    cipria: {
      it: 'I tulipani rosa cipria sono un augurio di felicità e di affetto gentile.',
      en: 'Powder-pink tulips wish you happiness and gentle affection.',
    },
    rosso: {
      it: 'I tulipani rossi sono una dichiarazione d’amore.',
      en: 'Red tulips are a declaration of love.',
    },
    lilla: {
      it: 'I tulipani lilla parlano di eleganza e di ammirazione.',
      en: 'Lilac tulips speak of elegance and admiration.',
    },
    pesca: {
      it: 'I tulipani pesca esprimono comprensione e gratitudine.',
      en: 'Peach tulips express understanding and gratitude.',
    },
    panna: {
      it: 'I tulipani bianchi portano pace e la promessa di un nuovo inizio.',
      en: 'White tulips bring peace and the promise of a fresh start.',
    },
  },
  margherita: {
    panna: {
      it: 'Le margherite bianche sono il fiore dell’innocenza e dei nuovi inizi.',
      en: 'White daisies are the flower of innocence and fresh starts.',
    },
    cipria: {
      it: 'Le margherite rosa cipria esprimono un affetto tenero e un po’ di ammirazione.',
      en: 'Powder-pink daisies express tender affection and a little admiration.',
    },
    magenta: {
      it: 'Le margherite magenta dicono grazie con allegria.',
      en: 'Magenta daisies say thank you, cheerfully.',
    },
  },
  girasole: {
    sole: {
      it: 'I girasoli gialli parlano di lealtà e di un’ammirazione calda come il sole.',
      en: 'Yellow sunflowers speak of loyalty and admiration as warm as the sun.',
    },
    corallo: {
      it: 'I girasoli corallo portano calore ed energia buona.',
      en: 'Coral sunflowers bring warmth and good energy.',
    },
    rosso: {
      it: 'I girasoli rossi raccontano un affetto forte e appassionato.',
      en: 'Red sunflowers tell of strong, passionate affection.',
    },
  },
  peonia: {
    corallo: {
      it: 'Le peonie corallo augurano felicità e un legame saldo.',
      en: 'Coral peonies wish you happiness and a strong bond.',
    },
    sole: {
      it: 'Le peonie gialle portano allegria e auguri per un nuovo inizio.',
      en: 'Yellow peonies bring cheer and good wishes for a fresh start.',
    },
    magenta: {
      it: 'Le peonie magenta esprimono un amore pieno e riconoscente.',
      en: 'Magenta peonies express a full, grateful love.',
    },
    cipria: {
      it: 'Le peonie rosa cipria sono l’augurio di un amore felice.',
      en: 'Powder-pink peonies wish you a happy love.',
    },
    rosso: {
      it: 'Le peonie rosse portano onore, rispetto e buona fortuna.',
      en: 'Red peonies bring honour, respect and good fortune.',
    },
    pesca: {
      it: 'Le peonie pesca esprimono una gratitudine dolce e discreta.',
      en: 'Peach peonies express soft, quiet gratitude.',
    },
    panna: {
      it: 'Le peonie bianche augurano un inizio sereno e luminoso.',
      en: 'White peonies wish you a serene, bright beginning.',
    },
  },
  ranuncolo: {
    corallo: {
      it: 'I ranuncoli corallo sprizzano gioia e buon umore.',
      en: 'Coral ranunculus burst with joy and good spirits.',
    },
    sole: {
      it: 'I ranuncoli gialli portano allegria e amicizia.',
      en: 'Yellow ranunculus bring cheer and friendship.',
    },
    magenta: {
      it: 'I ranuncoli magenta esprimono ammirazione con un pizzico di civetteria.',
      en: 'Magenta ranunculus express admiration with a hint of flirtation.',
    },
    cipria: {
      it: 'I ranuncoli rosa cipria raccontano un affetto tenero, come un’amicizia che sboccia.',
      en: 'Powder-pink ranunculus tell of tender affection, like a budding friendship.',
    },
    rosso: {
      it: 'I ranuncoli rossi parlano di un amore appassionato e luminoso.',
      en: 'Red ranunculus speak of passionate, radiant love.',
    },
    lilla: {
      it: 'I ranuncoli lilla parlano di bellezza, eleganza e fantasia.',
      en: 'Lilac ranunculus speak of beauty, elegance and imagination.',
    },
    pesca: {
      it: 'I ranuncoli pesca portano una gioia morbida e gentile.',
      en: 'Peach ranunculus bring soft, gentle joy.',
    },
    panna: {
      it: 'I ranuncoli bianchi sono grazia e raffinatezza.',
      en: 'White ranunculus are grace and refinement.',
    },
  },
  gerbera: {
    corallo: {
      it: 'Le gerbere corallo sono un raggio di sole: calore ed entusiasmo.',
      en: 'Coral gerberas are a ray of sunshine: warmth and enthusiasm.',
    },
    sole: {
      it: 'Le gerbere gialle illuminano la giornata di chi le riceve.',
      en: 'Yellow gerberas brighten the day of whoever receives them.',
    },
    magenta: {
      it: 'Le gerbere magenta esprimono un’ammirazione piena di vita.',
      en: 'Magenta gerberas express lively admiration.',
    },
    cipria: {
      it: 'Le gerbere rosa cipria dicono grazie con tenerezza.',
      en: 'Powder-pink gerberas say thank you, tenderly.',
    },
    rosso: {
      it: 'Le gerbere rosse raccontano un amore allegro e sincero.',
      en: 'Red gerberas tell of a cheerful, sincere love.',
    },
    pesca: {
      it: 'Le gerbere pesca portano dolcezza e buon umore.',
      en: 'Peach gerberas bring sweetness and good cheer.',
    },
    panna: {
      it: 'Le gerbere bianche parlano di purezza e di semplicità.',
      en: 'White gerberas speak of purity and simplicity.',
    },
  },
};
