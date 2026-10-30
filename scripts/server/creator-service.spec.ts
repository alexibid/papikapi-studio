import assert from 'node:assert';
import { CreatorService } from './creator-service.js';

console.log('Testing CreatorService model name resolution...');

// 1. Rejects isolated stop articles
assert.strictEqual(CreatorService.cleanModelName('um'), '');
assert.strictEqual(CreatorService.cleanModelName('uma'), '');
assert.strictEqual(CreatorService.cleanModelName('a'), '');
assert.strictEqual(CreatorService.cleanModelName('the'), '');
assert.strictEqual(CreatorService.cleanModelName('   '), '');

// 2. Strips leading stop articles when followed by a figure name
assert.strictEqual(CreatorService.cleanModelName('um-snoopy'), 'snoopy');
assert.strictEqual(CreatorService.cleanModelName('o-meu-gato'), 'meu-gato');
assert.strictEqual(CreatorService.cleanModelName('a-cute-dragon'), 'cute-dragon');

// 3. Derives full English figure name from prompt when name is isolated stop article or empty
const slug1 = CreatorService.resolveModelName('um', 'a cute cute white dog Snoopy in plush');
assert.strictEqual(slug1, 'snoopy-plush');

const slug2 = CreatorService.resolveModelName('', 'um peluche do Snoopy cão branco');
assert.strictEqual(slug2, 'snoopy-plush');

const slug3 = CreatorService.resolveModelName('model', 'bicolor black and white cat Tobias');
assert.strictEqual(slug3, 'bicolor-black-white-cat-tobias');

// 4. Preserves entire figure name without premature 20- or 24-character truncation
const longName = 'bicolor-black-and-white-cat-with-wings';
assert.strictEqual(CreatorService.cleanModelName(longName), 'bicolor-black-and-white-cat-with-wings');

const derived = CreatorService.deriveModelNameFromPrompt(
  'low-poly faceted 3D papercraft model of a cute emerald green baby dragon with gold belly. Seen in an EYE-LEVEL THREE-QUARTER VIEW...'
);
assert.ok(derived.includes('emerald-green-baby-dragon'));

// 5. Translates Portuguese tokens in figure name to English
assert.strictEqual(CreatorService.resolveModelName('dragao-bebe-verde'), 'dragon-baby-green');
assert.strictEqual(CreatorService.resolveModelName('gato-preto'), 'cat-black');

console.log('All CreatorService model name tests passed successfully!');
