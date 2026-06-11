import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger, loadEnv } from '@ptc/config';
import type { CoachRecommendation } from '@ptc/analysis';

/**
 * Erklärungsschicht (LLM). **Optional und abschaltbar** (LLM_ENABLED) und über
 * LLM_PROVIDER umschaltbar (anthropic | gemini). Das LLM entscheidet NICHTS –
 * die deterministische Empfehlung bleibt die Source of Truth. Hier wird nur ein
 * lesbarer Klartext (`explanationText`) erzeugt, der die feststehende
 * Entscheidung erklärt.
 *
 * Robustheit: Ist das LLM deaktiviert, fehlt der API-Key, oder schlägt der Call
 * fehl, liefert der Service `null` – Dashboard/Bot funktionieren unverändert.
 * Es werden niemals Fehlerinhalte mit Secrets geloggt.
 *
 * Hinweis Datenschutz: Cloud-Anbieter (anthropic, gemini) erhalten die in der
 * Empfehlung enthaltenen Werte. Gesundheitsdaten verlassen damit das Gerät.
 */
@Injectable()
export class LlmService {
  private readonly env = loadEnv();
  private readonly logger = createLogger('llm');
  private anthropic: Anthropic | null = null;

  /**
   * Erzeugt einen kurzen, erklärenden Klartext zur Empfehlung – oder `null`,
   * wenn das LLM deaktiviert ist, der Key fehlt oder der Call fehlschlägt.
   */
  async explainRecommendation(rec: CoachRecommendation): Promise<string | null> {
    if (!this.env.LLM_ENABLED) return null;

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
      const text =
        this.env.LLM_PROVIDER === 'gemini'
          ? await this.callGemini(system, user)
          : await this.callAnthropic(system, user);
      const trimmed = text?.trim() ?? '';
      return trimmed.length > 0 ? trimmed : null;
    } catch (err) {
      // Niemals den Flow brechen; nur eine knappe, secret-freie Warnung loggen.
      this.logger.warn(
        { provider: this.env.LLM_PROVIDER, error: errorLabel(err) },
        'LLM-Erklärung fehlgeschlagen – fahre ohne fort.',
      );
      return null;
    }
  }

  // --- Anthropic (Claude) ----------------------------------------------------

  private async callAnthropic(system: string, user: string): Promise<string | null> {
    if (!this.env.ANTHROPIC_API_KEY) return null;
    if (!this.anthropic) {
      this.anthropic = new Anthropic({ apiKey: this.env.ANTHROPIC_API_KEY });
    }
    const response = await this.anthropic.messages.create({
      model: this.env.LLM_MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  // --- Google Gemini (REST, Free-Tier) --------------------------------------

  private async callGemini(system: string, user: string): Promise<string | null> {
    const key = this.env.GEMINI_API_KEY;
    if (!key) return null;

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(this.env.GEMINI_MODEL)}:generateContent`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}`);
    }

    const data = (await res.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return parts
      .map((p) => p.text ?? '')
      .join('')
      .trim();
  }
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/** Knappe, secret-freie Fehlerbeschreibung fürs Logging. */
function errorLabel(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `anthropic_${err.status ?? 'error'}`;
  if (err instanceof Error) return err.message.slice(0, 80);
  return 'unknown';
}
