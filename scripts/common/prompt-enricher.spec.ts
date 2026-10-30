import { describe, expect, it } from 'vitest';
import { AlternativesGenerator } from '../stage-1/step-1-alternatives.js';
import { PromptEnricher } from './prompt-enricher.js';
import { PromptGuard } from './prompt-guard.js';

describe('PromptEnricher.sanitize', () => {
  it.each([
    ['black tuxedo cat', 'bicolor black and white cat'],
    ['a Tuxedo Cat named Darth', 'a bicolor black and white Cat named Darth'],
    ['black and white tuxedo kitten with white socks', 'bicolor black and white kitten with white socks'],
    ['Tuxedo-cat', 'bicolor black and white-cat'],
    ['gato smoking', 'gato bicolor black and white'],
  ])('replaces clothing words in %s', (input, expected) => {
    expect(PromptEnricher.sanitize(input)).toBe(expected);
  });

  it.each([
    ['cat with whiskers', 'cat'],
    ['white muzzle with no whiskers', 'white muzzle'],
    ['cat, whiskerless, zero whiskers', 'cat'],
  ])('drops whiskers from %s', (input, expected) => {
    expect(PromptEnricher.sanitize(input)).toBe(expected);
  });

  it('turns a cap on the head into fur', () => {
    expect(PromptEnricher.sanitize('a cat with a black cap on its head')).not.toMatch(/\bcap\b|on its head/);
  });
});

describe('PromptGuard', () => {
  it('rejects system directives inside the user prompt', () => {
    expect(() => PromptGuard.assertSubject('a cat standing on a plinth with zero shadows')).toThrow(/system directive/);
  });

  it('accepts a pure subject description', () => {
    const subject = PromptEnricher.subjectFrom('a cute black tuxedo cat, white blaze between the eyes, green eyes');
    expect(PromptGuard.assertSubject(subject)).toBe(subject);
  });

  it('rejects clothing and whisker triggers', () => {
    expect(() => PromptGuard.assertPrompt('a tuxedo cat')).toThrow(/tuxedo/);
    expect(() => PromptGuard.assertPrompt('a cat with whiskers')).toThrow(/whiskers/);
  });
});

describe('PromptGuard system block', () => {
  it('refuses a prompt that lacks the system block', () => {
    expect(() => PromptGuard.assertSystemBlock('a black and white cat')).toThrow(/mandatory system clause/);
  });

  it('refuses a block that lets the figure open its mouth', () => {
    const prompt = AlternativesGenerator.composePrompt('a t-rex', 0);
    expect(() => PromptGuard.assertSystemBlock(prompt.replace(/mouth is always closed/, 'mouth may open'))).toThrow(/mouth/);
  });

  it('keeps the scarf of a blocky character as painted pixels, not as a built part', () => {
    const prompt = AlternativesGenerator.composePrompt('Alex from Minecraft with a scarf', 0);
    expect(prompt).toMatch(/flat pixel patterns printed on those faces/);
    expect(() => PromptGuard.assertSystemBlock(prompt.replace(/never built as an extra block or flap/, 'built as blocks')))
      .toThrow(/extra block/);
  });

  it('refuses a thick or white plinth in place of the contrasting flat plane', () => {
    const prompt = AlternativesGenerator.composePrompt('a black and white cat', 1);
    const slab = prompt.replace(/single flat plane of zero thickness/, 'thin white slab');
    expect(() => PromptGuard.assertSystemBlock(slab)).toThrow(/zero thickness/);
  });
});

describe('FLUX prompts', () => {
  const subject = PromptEnricher.subjectFrom('a cute black tuxedo cat with a white blaze between the eyes, standing');
  const cells = AlternativesGenerator.buildCellPrompts(subject, 1);

  it('sends one prompt per alternative, each the user subject followed by the system block', () => {
    expect(cells).toHaveLength(6);
    cells.forEach((cell) => {
      expect(cell).toContain(`${subject}. The figure stands on one single flat plane`);
      expect(cell.indexOf('never sitting')).toBeLessThan(cell.indexOf(subject));
      expect(() => PromptGuard.assertPrompt(cell)).not.toThrow();
    });
  });

  it('states every system clause exactly once', () => {
    expect(cells[0].match(/three-quarter view/g)).toHaveLength(1);
    expect(cells[0].match(/single flat plane/g)).toHaveLength(1);
  });

  it('keeps the system block out of the user subject', () => {
    expect(() => PromptGuard.assertSubject(`${subject}, on a plinth`)).toThrow(/system directive/);
  });
});

describe('default pose', () => {
  it('adds the system pose when the user describes none', () => {
    expect(AlternativesGenerator.composePrompt('a black and white cat', 1)).toMatch(/never sitting, crouching or lying down/);
  });

  it('keeps the user pose and leaves the system pose out', () => {
    const prompt = AlternativesGenerator.composePrompt('a black and white cat sitting upright', 1);
    expect(prompt).toMatch(/sitting upright/);
    expect(prompt).not.toMatch(/never sitting/);
  });
});

describe('plane colour and reference rule', () => {
  it('lays a neutral matte plane, white unless the subject is white', () => {
    expect(AlternativesGenerator.composePrompt('a blue parrot', 1)).toMatch(/sheet of matte white paper/);
    expect(AlternativesGenerator.composePrompt('a black and white cat', 1)).toMatch(/sheet of matte mid grey paper/);
    expect(AlternativesGenerator.composePrompt('a white rabbit with gray ears', 1)).toMatch(/sheet of matte black paper/);
  });

  it('never asks for a saturated plane that would tint the figure', () => {
    expect(AlternativesGenerator.composePrompt('a fawn pug', 1)).not.toMatch(/saturated/);
    expect(AlternativesGenerator.composePrompt('a fawn pug', 1)).toMatch(/casts no colour onto it/);
  });

  it('tells the generator to take only colours and markings from the photo', () => {
    expect(AlternativesGenerator.composePrompt('a black and white cat', 1)).toMatch(/never for its pose or camera angle/);
    expect(AlternativesGenerator.composePrompt('a black and white cat', 0)).not.toMatch(/reference photo/);
  });
});
