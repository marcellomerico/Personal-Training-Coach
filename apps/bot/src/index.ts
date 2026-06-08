import { Bot } from "grammy";
import { createLogger, loadEnv } from "@ptc/config";

/**
 * Telegram-Bot (Long-Polling). Phase 1: nur Grundgerüst + /start.
 * Befehle wie /today, /last, /sync folgen in Phase 3 und rufen die API/Core.
 */
const env = loadEnv();
const log = createLogger("bot");

async function main() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    log.warn("TELEGRAM_BOT_TOKEN nicht gesetzt – Bot startet nicht (Stub).");
    return;
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Willkommen beim Personal Training Coach. Account-Verknüpfung folgt in Kürze.",
    );
  });

  log.info("Bot startet (Long-Polling)...");
  await bot.start();
}

void main();
