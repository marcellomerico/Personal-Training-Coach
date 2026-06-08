import { Bot } from "grammy";
import { createLogger, loadEnv } from "@ptc/config";

/**
 * Telegram-Bot (Long-Polling). Phase 1: Grundgerüst + Account-Verknüpfung.
 * Über den Deep-Link `https://t.me/<bot>?start=<token>` aus der Web-App/API
 * sendet Telegram `/start <token>`. Der Bot bestätigt die Verknüpfung gegen
 * die API. Feature-Befehle (/today, /last, /sync) folgen in Phase 3.
 */
const env = loadEnv();
const log = createLogger("bot");

async function confirmLink(
  token: string,
  telegramUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.INTERNAL_API_KEY) headers["x-internal-key"] = env.INTERNAL_API_KEY;

  try {
    const res = await fetch(`${env.API_BASE_URL}/auth/telegram/confirm`, {
      method: "POST",
      headers,
      body: JSON.stringify({ token, telegramUserId }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as
      | { message?: string }
      | null;
    return { ok: false, error: body?.message ?? `HTTP ${res.status}` };
  } catch (err) {
    log.error({ err }, "Telegram-Link-Bestätigung fehlgeschlagen");
    return { ok: false, error: "API nicht erreichbar" };
  }
}

async function main() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    log.warn("TELEGRAM_BOT_TOKEN nicht gesetzt – Bot startet nicht (Stub).");
    return;
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", async (ctx) => {
    const token = ctx.match?.trim();
    const telegramUserId = ctx.from?.id;

    if (!token) {
      await ctx.reply(
        "Willkommen beim Personal Training Coach.\n\n" +
          "Um dein Konto zu verknüpfen, öffne in der Web-App die Telegram-" +
          "Verknüpfung und folge dem Link hierher.",
      );
      return;
    }

    if (!telegramUserId) {
      await ctx.reply("Konnte deine Telegram-ID nicht ermitteln. Bitte erneut versuchen.");
      return;
    }

    const result = await confirmLink(token, String(telegramUserId));
    if (result.ok) {
      await ctx.reply("Dein Telegram-Konto ist jetzt verknüpft. ✅");
    } else {
      await ctx.reply(
        `Verknüpfung fehlgeschlagen: ${result.error}.\n` +
          "Der Link ist evtl. abgelaufen – erzeuge in der Web-App einen neuen.",
      );
    }
  });

  log.info("Bot startet (Long-Polling)...");
  await bot.start();
}

void main();
