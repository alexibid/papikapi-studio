export class PromptGuard {
  private static readonly requiredSystemClauses: readonly RegExp[] = [
    /low-poly faceted 3D papercraft model/i,
    /painted flat on the facets as a 2D decal/i,
    /eye-level three-quarter view/i,
    /single flat plane of zero thickness/i,
    /contrasts strongly with every part of the figure touching it/i,
    /^(?![\s\S]*\{plane_colour\})/,
    /#E5E5E5 background/i,
    /zero shadows/i,
  ];

  private static readonly systemDirectives =
    /\b(shadows?|plinth|slab|pedestal|facets?|cardstock|papercraft|low-poly|ground\s+plane|background|three-quarter|camera|decals?|wheels?)\b/i;
  private static readonly hallucinationTriggers = /\b(tuxedos?|smoking|whiskers?|bigodes?|whiskerless)\b/i;

  public static assertSubject(subject: string): string {
    const directive = subject.match(this.systemDirectives)?.[0];
    if (directive) {
      throw new Error(`User prompt carries a system directive ("${directive}"): it belongs in the system prompt`);
    }
    this.assertPrompt(subject);
    return subject;
  }

  public static assertPrompt(prompt: string): string {
    const trigger = prompt.match(this.hallucinationTriggers)?.[0];
    if (trigger) {
      throw new Error(`Prompt contains "${trigger}", which makes the generator hallucinate clothing or whiskers`);
    }
    return prompt;
  }

  public static assertSystemBlock(prompt: string): string {
    const missing = this.requiredSystemClauses.find((clause) => !clause.test(prompt));
    if (missing) {
      throw new Error(`Prompt is missing the mandatory system clause ${missing}`);
    }
    return prompt;
  }
}
