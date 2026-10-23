export type SubjectCategory = 'quadruped' | 'biped' | 'aquatic' | 'vehicle' | 'creature' | 'object';

export interface SubjectClassification {
  readonly category: SubjectCategory;
  readonly isLiving: boolean;
  readonly hasMuzzleOrCheeks: boolean;
  readonly stanceClause: string;
  readonly featuresClause: string;
  readonly eyesClause: string;
  readonly volumeClause: string;
}

export class PromptEnricher {
  public static classify(subject: string): SubjectClassification {
    const s = subject.toLowerCase();

    const isQuadruped =
      /\b(cat|kitten|kitty|feline|tuxedo|calico|tabby|siamese|gato|gata|gatinho|gatinha|felino|dog|puppy|hound|canine|cao|cão|cachorro|cadela|cachorrinho|pug|shepherd|dalmatian|rottweiler|golden|retriever|lion|leao|leão|tiger|tigre|cheetah|chita|guepardo|leopard|leopardo|panther|pantera|jaguar|giraffe|girafa|zebra|elephant|elefante|hippo|hipopotamo|hipopótamo|rhino|rinoceronte|bear|urso|fox|raposa|deer|veado|fawn|wolf|lobo|squirrel|esquilo|hedgehog|ourico|ouriço|raccoon|guaxinim|horse|cavalo|pony|ponei|pónei|donkey|burro|cow|vaca|bull|touro|calf|bezerro|pig|porco|sheep|ovelha|lamb|cordeiro|goat|cabra|cabrito|rabbit|bunny|coelho|hamster|mouse|rato|ratinho)\b/i.test(s);

    const isBipedCreature =
      /\b(t-rex|trex|tyrannosaurus|velociraptor|raptor|dino|dinosaur|dinossauro|kangaroo|canguru|bird|passaro|pássaro|ave|owl|coruja|duck|pato|penguin|pinguim|chicken|galinha|galo|eagle|aguia|águia|parrot|papagaio|toucan|tucano|flamingo|ostrich|avestruz)\b/i.test(s);

    const isAquatic =
      /\b(fish|peixe|peixinho|shark|tubarao|tubarão|dolphin|golfinho|whale|baleia|orca|octopus|polvo|squid|lula|turtle|tartaruga|seahorse|cavalo-marinho|clownfish|peixe-palhaco|peixe-palhaço)\b/i.test(s);

    const isVehicle =
      /\b(car|carro|carrinho|truck|camiao|camião|camioneta|fire\s*truck|bombeiros|police\s*car|policia|polícia|ambulance|ambulancia|ambulância|tractor|trator|plane|airplane|aviao|avião|helicopter|helicoptero|helicóptero|train|comboio|trem|locomotive|locomotiva|boat|barco|ship|navio|submarine|submarino|rocket|foguetao|foguetão|foguete|spaceship|nave|motorcycle|moto|motociclo|bicycle|bike|bicicleta|vehicle|veiculo|veículo)\b/i.test(s);

    const isFantasyCreature =
      /\b(dragon|dragao|dragão|monster|monstro|pokemon|pokémon|pikachu|creeper|zombie|alien|extraterrestre)\b/i.test(s);

    const isLiving =
      isQuadruped ||
      isBipedCreature ||
      isAquatic ||
      isFantasyCreature ||
      /\b(animal|bicho|creature|criatura|pet|mascote|baby|bebe|bebé)\b/i.test(s);

    const hasMuzzleOrCheeks =
      isQuadruped ||
      /\b(dragon|dragao|dragão|bear|urso|fox|raposa|wolf|lobo)\b/i.test(s);

    let category: SubjectCategory = 'object';
    if (isVehicle) category = 'vehicle';
    else if (isQuadruped) category = 'quadruped';
    else if (isBipedCreature) category = 'biped';
    else if (isAquatic) category = 'aquatic';
    else if (isLiving) category = 'creature';

    const stanceClause = isQuadruped
      ? 'standing naturally on all four paws flat on the ground plane, exactly four distinct legs and four paws, belly elevated above the ground plane, smooth continuous back with exactly one single tail attached at the base of the spine (zero duplicate tails, never two tails, zero dorsal protrusions), full body profile in eye-level three-quarter view showing front and side, zero extra limbs, never sitting, never seated on hind legs, never bipedal'
      : isBipedCreature
        ? 'standing naturally upright and balanced with exactly two feet flat on the ground plane, exactly two legs, zero extra limbs'
        : isAquatic
          ? 'horizontal swimming posture, eye-level three-quarter view'
          : isVehicle
            ? 'resting level and stable with all wheels, tracks, or hull flat on the ground plane'
            : 'standing naturally with all feet flat on the ground plane';

    const featuresClause = hasMuzzleOrCheeks
      ? 'smooth bare paper cardstock cheeks, plain muzzle with a distinct cute closed mouth line decal'
      : isLiving
        ? 'smooth clean paper cardstock facial surfaces, zero thin spikes'
        : isVehicle
          ? 'closed solid geometric body and chassis, headlights and decals painted flat as 2D UV texture decals, zero thin antennae'
          : 'closed solid geometric volume, surface details painted flat as 2D decals';

    const eyesClause = isLiving
      ? 'exactly two large expressive eyes with white catchlights'
      : '';

    const volumeClause =
      'pure low-poly papercraft cardstock facets with clean planar folds, closed solid volumes with fine details painted flat as 2D UV texture decals';

    return {
      category,
      isLiving,
      hasMuzzleOrCheeks,
      stanceClause,
      featuresClause,
      eyesClause,
      volumeClause,
    };
  }

  public static sanitize(input: string): string {
    let clean = input.trim();
    // 1. Replace tuxedo with literal colors to prevent human clothing hallucinations
    clean = clean.replace(/\bblack\s+tuxedo\s+(cat|kitten)\b/gi, 'bicolor black and white $1');
    clean = clean.replace(/\bblack\s+tuxedo\b/gi, 'bicolor black and white');
    clean = clean.replace(/\btuxedo\s+(cat|kitten)\b/gi, 'bicolor black and white $1');
    clean = clean.replace(/\btuxedo\b/gi, 'bicolor black and white');

    // 2. Replace head cap or cap patterns with explicit fur description to prevent hat hallucinations
    clean = clean.replace(/\b(black\s+)?head\s+cap\b/gi, 'black fur covering the top of the head and ears');
    clean = clean.replace(/\bblack\s+cap\b/gi, 'black fur on top of head');

    // 3. Prevent the word "whiskers" or "bigodes" from entering the positive prompt!
    clean = clean.replace(/\b((closed|clean|smooth)\s+)+muzzle\s+(with\s+|com\s+)?(zero|no|without|sem)\s+(facial\s+)?(whiskers?|bigodes?)\b/gi, 'smooth bare paper cardstock cheeks, whiskerless muzzle with a subtle cute closed mouth line decal');
    clean = clean.replace(/\bmuzzle\s+(with\s+|com\s+)?(zero|no|without|sem)\s+(facial\s+)?(whiskers?|bigodes?)\b/gi, 'smooth bare paper cardstock cheeks, whiskerless muzzle with a subtle cute closed mouth line decal');
    clean = clean.replace(/\b(with\s+|com\s+)?(zero|no|without|sem)\s+(facial\s+)?(whiskers?|bigodes?)\b/gi, 'smooth bare paper cardstock cheeks, whiskerless muzzle with a subtle cute closed mouth line decal');
    clean = clean.replace(/\b(com\s+)?(whiskers?|bigodes?)\b/gi, '');

    // 3. Clean up extra punctuation/spaces
    clean = clean.replace(/\s+,/g, ',').replace(/,\s*,+/g, ',').replace(/\s{2,}/g, ' ').trim();
    return clean;
  }

  public static enrichSubject(subject: string): string {
    const clean = this.sanitize(subject);
    const info = this.classify(clean);

    // If already fully enriched, return sanitized clean
    if (clean.includes('low-poly papercraft cardstock facets') && clean.includes('zero floor shadow')) {
      return clean;
    }

    const subjectLabel = /^a\s+cute\s+/i.test(clean) ? clean : `a cute ${clean}`;
    const clauses = [
      subjectLabel,
      info.stanceClause,
      info.volumeClause,
      info.featuresClause,
      info.eyesClause,
      'zero floor shadow',
    ].filter(Boolean);

    return clauses.join(', ');
  }

  public static getDetailsForSubject(name: string, subject: string, trainingPrompt?: string | null): string {
    const cleanSubject = this.sanitize(subject);
    const info = this.classify(cleanSubject);

    if (trainingPrompt && trainingPrompt.trim().length > 0) {
      return this.sanitize(trainingPrompt);
    }

    const detailsClauses = [
      info.stanceClause,
      info.volumeClause,
      info.featuresClause,
      info.eyesClause,
    ].filter(Boolean);

    return detailsClauses.join(', ');
  }
}
