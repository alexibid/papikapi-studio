export class PromptEnricher {
  private static readonly bicolour = 'bicolor black and white';

  public static sanitize(input: string): string {
    const clean = input
      .replace(/\b(?:black\s+(?:and\s+white\s+)?)?tuxedos?\b(?:[\s-]+style)?/gi, this.bicolour)
      .replace(/\bsmoking\b/gi, this.bicolour)
      .replace(/\b(?:black\s+)?(?:head\s+)?cap\b(?:\s+(?:on|over)\s+(?:its|the|his|her)\s+head)?/gi, 'black fur covering the top of the head and ears')
      .replace(/(?:\b(?:with|com)\s+)?(?:\b(?:zero|no|without|sem)\s+)?(?:facial\s+)?\b(?:whiskers?|bigodes?|whiskerless)\b/gi, '');
    return clean.replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
  }

  public static subjectFrom(userText: string): string {
    return this.sanitize(userText);
  }

  private static readonly poseWords = new RegExp(
    `\\b(${[
      'stand(?:s|ing)?', 'sit(?:s|ting)?', 'seated', 'lying', 'lies', 'crouch(?:es|ing)?', 'walk(?:s|ing)?',
      'run(?:s|ning)?', 'jump(?:s|ing)?', 'leap(?:s|ing)?', 'swim(?:s|ming)?', 'fly(?:ing)?', 'flies',
      'sleep(?:s|ing)?', 'curled', 'rear(?:s|ing)?', 'pose', 'posture', 'stance',
    ].join('|')})\\b`,
    'i',
  );

  public static describesPose(subject: string): boolean {
    return this.poseWords.test(subject);
  }

  /** First plane colour the subject does not name; "mid grey" counts as named by "grey" or "gray". */
  public static contrastingColour(subject: string, colours: readonly string[]): string {
    const unused = colours.find((colour) => !this.colourWord(colour).test(subject));
    if (!unused) {
      throw new Error(`Every plane colour (${colours.join(', ')}) appears in the subject: add a colour to plane_colours`);
    }
    return unused;
  }

  private static colourWord(colour: string): RegExp {
    const word = colour.split(' ').at(-1) ?? colour;
    return new RegExp(`\\b${word.replace(/^gr[ae]y$/i, 'gr[ae]y')}\\b`, 'i');
  }
}
