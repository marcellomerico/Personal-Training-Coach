import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger, loadEnv } from '@ptc/config';
import type { CoachRecommendation } from '@ptc/analysis';

/**
 * Erklärungsschicht (Claude). **Optional und abschaltbar** (LLM_ENABLED).
 * Das LLM entscheidet NICHTS – die deterministische Empfehlung bleibt die
 * Source of Truth. Hier wird nur ein lesbarer Klartext (`explanationText`)
 * erzeugt, der die bereits feststehende Entscheidung erklärt.
 *
 * Robustheit: Ist das LLM deaktiviert, fehlt der API-Key, oder schlägt der Call
 * fehl, liefert der Service `null` – Dashboard/Bot funktionieren unverändert.
 * Es werden niemals Fehlerinhalte mit Secrets geloggt.
 */
@Injectable()
export class LlmService {
  private readonly env = loadEnv();
  private readonly logger = createLogger('llm');
  private client: Anthropic | null = null;

  private get enabled(): boolean {
    return this.env.LLM_ENABLED && !!this.env.ANTHROPIC_API_KEY;
  }

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  /**
   * Erzeugt einen kurzen, erklärenden Klartext zur Empfehlung – oder `null`,
   * wenn das LLM deaktiviert ist oder der Call fehlschlägt.
   */
  async explainRecommendation(rec: CoachRecommendation): Promise<string | null> {
    if (!this.enabled) return null;

    const system = [
      'Du bist ein nüchterner Ausdauer-Coach und erklärst eine bereits getroffene',
      'Trainingsempfehlung auf Deutsch, in Du-Form.',
      'Die Entscheidung steht fest – du änderst sie NICHT, du begründest sie nur verständlich.',
      'Antworte mit 2–3 kurzen Sätzen, ohne Aufzählung, ohne Einleitung, kein medizinischer Rat.',
    ].join(' ');

    const user = [
      `Entscheidung: ${rec.decision} (${rec.headline}).`,
      `Readiness-Score: ${rec.readinessScore}/100.`,
      `Hinweise: ${rec.guidance.join(' ')}`,
      `Begründung (Daten): ${rec.reasons.join(' ')}`,
      'Formuliere daraus eine kurze, motivierende Erklärung für heute.',
    ].join('\n');

    try {
      const response = await this.getClient().messages.create({
        model: this.env.LLM_MODEL,
        max_tokens: 512,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();
      return text.length > 0 ? text : null;
    } catch (err) {
      // Niemals den Flow brechen; nur Fehlerklasse/Status loggen, keine Secrets.
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      this.logger.warn({ status }, 'LLM-Erklärung fehlgeschlagen – fahre ohne fort.');
      return null;
    }
  }
}
