import { Bot } from "grammy";
import { createLogger, loadEnv } from "@ptc/config";

/**
 * Telegram-Bot (Long-Polling). Phase 3: Bot-MVP.
 * Über den Deep-Link `https://t.me/<bot>?start=<token>` aus der Web-App/API
 * sendet Telegram `/start <token>`. Der Bot bestätigt die Verknüpfung gegen
 * die API. Alle Feature-Befehle rufen interne API-Endpunkte auf; der Bot
 * enthält keine eigene Business-Logik.
 */
const env = loadEnv();
const log = createLogger("bot");

interface ApiErrorBody {
  message?: string | string[];
}

interface BotTodayResponse {
  user: { displayName: string | null };
  health: {
    restingHr: number | null;
    hrv: number | null;
    bodyBattery: number | null;
    stressAvg: number | null;
    steps: number | null;
  } | null;
  sleep: {
    totalSleepSec: number | null;
    sleepScore: number | null;
    deepSec: number | null;
    remSec: number | null;
    awakeSec: number | null;
  } | null;
  latestActivity: BotActivitySummary | null;
  readiness: {
    score: number;
    decision: string;
    decisionText: string;
    summary: string;
  } | null;
  recommendation: {
    headline: string;
    guidance: string[];
    reasons: string[];
    explanationText: string | null;
  } | null;
}

interface BotActivitySummary {
  type: string;
  startTime: string;
  durationSec: number;
  distanceM: number | null;
  avgHr: number | null;
  calories: number | null;
}

interface BotLastActivityResponse {
  activity: BotActivitySummary | null;
}

interface BotSyncResponse {
  stats: {
    rawImports: number;
    activities: number;
    dailyHealth: number;
    sleep: number;
  };
  syncJob: {
    id: string;
    status: string;
  };
}

interface ReplyContext {
  from?: { id: number };
  reply(text: string): Promise<unknown>;
}

function internalHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (json) headers["content-type"] = "application/json";
  if (env.INTERNAL_API_KEY) headers["x-internal-key"] = env.INTERNAL_API_KEY;
  return headers;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    const res = await fetch(`${env.API_BASE_URL}${path}`, init);
    if (res.ok) return (await res.json()) as T;
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new Error(message ?? `HTTP ${res.status}`);
  } catch (err) {
    log.error({ err, path }, "API-Aufruf fehlgeschlagen");
    throw err;
  }
}

function startToken(match: unknown): string | null {
  if (typeof match !== "string") return null;
  const token = match.trim();
  return token.length > 0 ? token : null;
}

function telegramUserId(ctx: { from?: { id: number } }): string | null {
  return ctx.from?.id ? String(ctx.from.id) : null;
}

function helpText(): string {
  return [
    "Personal Training Coach",
    "",
    "Befehle:",
    "/today - Tagesstatus mit Schlaf, HRV und letzter Aktivitaet",
    "/last - letzte importierte Aktivitaet",
    "/sync - Garmin-Sync starten (Stub/Connector muss laufen)",
    "/help - Hilfe anzeigen",
    "",
    "Falls du noch nicht verknuepft bist: Erzeuge in der Web-App/API einen Telegram-Link und oeffne ihn hier.",
  ].join("\n");
}

function fmt(value: number | null, suffix = ""): string {
  return value === null ? "-" : `${value}${suffix}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function formatDistance(meters: number | null): string {
  if (meters === null) return "-";
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatActivity(activity: BotActivitySummary | null): string {
  if (!activity) return "Keine Aktivitaet importiert.";
  const date = new Date(activity.startTime).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return [
    `${activity.type} am ${date}`,
    `Dauer: ${formatDuration(activity.durationSec)}`,
    `Distanz: ${formatDistance(activity.distanceM)}`,
    `Ø HF: ${fmt(activity.avgHr, " bpm")}`,
    `Kalorien: ${fmt(activity.calories, " kcal")}`,
  ].join("\n");
}

function formatToday(data: BotTodayResponse): string {
  const name = data.user.displayName ?? "du";
  const health = data.health
    ? [
        `HRV: ${fmt(data.health.hrv)}`,
        `Ruhepuls: ${fmt(data.health.restingHr, " bpm")}`,
        `Body Battery: ${fmt(data.health.bodyBattery)}`,
        `Stress: ${fmt(data.health.stressAvg)}`,
        `Schritte: ${fmt(data.health.steps)}`,
      ].join("\n")
    : "Noch keine Gesundheitsdaten importiert.";

  const sleep = data.sleep
    ? [
        `Schlaf: ${formatDuration(data.sleep.totalSleepSec)}`,
        `Sleep Score: ${fmt(data.sleep.sleepScore)}`,
        `Tief: ${formatDuration(data.sleep.deepSec)}`,
        `REM: ${formatDuration(data.sleep.remSec)}`,
        `Wach: ${formatDuration(data.sleep.awakeSec)}`,
      ].join("\n")
    : "Noch keine Schlafdaten importiert.";

  const readiness = data.readiness
    ? [
        `Score: ${data.readiness.score}/100 (${data.readiness.decisionText})`,
        data.readiness.summary,
      ].join("\n")
    : "Noch keine Bewertung berechnet - /sync starten.";

  const recommendation = data.recommendation
    ? [
        data.recommendation.headline,
        ...data.recommendation.guidance.map((g) => `- ${g}`),
        ...(data.recommendation.explanationText
          ? ["", data.recommendation.explanationText]
          : []),
      ].join("\n")
    : "Noch keine Empfehlung - /sync starten.";

  return [
    `Tagesstatus fuer ${name}`,
    "",
    "Empfehlung",
    recommendation,
    "",
    "Readiness",
    readiness,
    "",
    "Gesundheit",
    health,
    "",
    "Schlaf",
    sleep,
    "",
    "Letzte Aktivitaet",
    formatActivity(data.latestActivity),
  ].join("\n");
}

async function requireTelegramId(ctx: ReplyContext): Promise<string | null> {
  const id = telegramUserId(ctx);
  if (!id) {
    await ctx.reply("Konnte deine Telegram-ID nicht ermitteln. Bitte erneut versuchen.");
    return null;
  }
  return id;
}

async function main() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    log.warn("TELEGRAM_BOT_TOKEN nicht gesetzt – Bot startet nicht (Stub).");
    return;
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", async (ctx) => {
    const token = startToken(ctx.match);
    const id = await requireTelegramId(ctx);
    if (!id) return;

    if (!token) {
      await ctx.reply(
        "Willkommen beim Personal Training Coach.\n\n" + helpText(),
      );
      return;
    }

    try {
      await apiRequest<{ ok: true; userId: string }>("/auth/telegram/confirm", {
        method: "POST",
        headers: internalHeaders(true),
        body: JSON.stringify({ token, telegramUserId: id }),
      });
      await ctx.reply("Dein Telegram-Konto ist jetzt verknuepft.");
    } catch (err) {
      await ctx.reply(
        `Verknuepfung fehlgeschlagen: ${(err as Error).message}.\n` +
          "Der Link ist evtl. abgelaufen - erzeuge in der Web-App/API einen neuen.",
      );
    }
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(helpText());
  });

  bot.command("today", async (ctx) => {
    const id = await requireTelegramId(ctx);
    if (!id) return;
    try {
      const data = await apiRequest<BotTodayResponse>(
        `/bot/today?telegramUserId=${encodeURIComponent(id)}`,
        { headers: internalHeaders() },
      );
      await ctx.reply(formatToday(data));
    } catch (err) {
      await ctx.reply(`Konnte den Tagesstatus nicht laden: ${(err as Error).message}`);
    }
  });

  bot.command("last", async (ctx) => {
    const id = await requireTelegramId(ctx);
    if (!id) return;
    try {
      const data = await apiRequest<BotLastActivityResponse>(
        `/bot/last-activity?telegramUserId=${encodeURIComponent(id)}`,
        { headers: internalHeaders() },
      );
      await ctx.reply(formatActivity(data.activity));
    } catch (err) {
      await ctx.reply(`Konnte die letzte Aktivitaet nicht laden: ${(err as Error).message}`);
    }
  });

  bot.command("sync", async (ctx) => {
    const id = await requireTelegramId(ctx);
    if (!id) return;
    await ctx.reply("Starte Garmin-Sync...");
    try {
      const data = await apiRequest<BotSyncResponse>("/bot/sync", {
        method: "POST",
        headers: internalHeaders(true),
        body: JSON.stringify({ telegramUserId: id }),
      });
      await ctx.reply(
        [
          "Garmin-Sync abgeschlossen.",
          `Job: ${data.syncJob.id} (${data.syncJob.status})`,
          `Aktivitaeten: ${data.stats.activities}`,
          `Gesundheitstage: ${data.stats.dailyHealth}`,
          `Schlafnaechte: ${data.stats.sleep}`,
          `Rohdaten: ${data.stats.rawImports}`,
        ].join("\n"),
      );
    } catch (err) {
      await ctx.reply(
        `Sync fehlgeschlagen: ${(err as Error).message}\n` +
          "Pruefe, ob API und Garmin-Connector laufen und dein Konto verknuepft ist.",
      );
    }
  });

  await bot.api.setMyCommands([
    { command: "today", description: "Tagesstatus anzeigen" },
    { command: "last", description: "Letzte Aktivitaet anzeigen" },
    { command: "sync", description: "Garmin-Sync starten" },
    { command: "help", description: "Hilfe anzeigen" },
  ]);

  log.info("Bot startet (Long-Polling)...");
  await bot.start();
}

void main();
