import { AgeTierId } from '../models/age-tier';

export const PROMPT_PRESETS: Record<AgeTierId, readonly string[]> = {
  'tier-4-6': [
    'Cuddly pug puppy with floppy ears and a smiling snout',
    'Chubby yellow chick with tiny wings and an orange beak',
    'Sweet kitten with pointed ears, short paws and an upright tail',
    'Panda cub with black eye patches and a round belly',
  ],
  'tier-7-10': [
    'Green alligator with sharp teeth, a serrated dorsal ridge and 4 slot-in legs',
    'Stegosaurus with a domed body, double dorsal plates and a spiked tail',
    'Cunning orange fox with a slender snout, pointed ears and a bushy tail',
    'Triceratops with 3 horns on the head, a protective frill and sturdy legs',
  ],
  'tier-11-14': [
    'Bipedal T-Rex predator in a running pose with a toothed articulated jaw and a long tail',
    'Winged fire dragon with wedge-open wings, sharp horns and a spiked crest',
    'Sabre-toothed tiger with long fangs, sharp claws and an athletic body',
    'Swift falcon with a curved beak and wings angled for a dive',
  ],
  'tier-14-plus': [
    'Celestial master dragon with branching horns, majestic wings and dorsal spikes',
    'Mythical phoenix with flaming plumage, a fire crest and a flowing tail',
    'Guardian griffin with a lion body, eagle head and claws, and open wings',
    'Serpentine sea leviathan with dorsal fins and an armoured jaw',
  ],
};
