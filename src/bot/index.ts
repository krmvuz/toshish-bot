import { Telegraf, Scenes, session } from "telegraf";
import type { Context } from "telegraf";
import type { Scenes as ScenesType } from "telegraf";
import { employerRegisterScene, employerPostJobScene } from "./handlers/employer.js";
import { workerRegisterScene } from "./handlers/worker.js";
import { setupAdminHandlers } from "./handlers/admin.js";
import { setupScheduler } from "./scheduler.js";
import { queries } from "./db.js";
import {
  roleSelectorKeyboard,
  employerMenuKeyboard,
  workerMenuKeyboard,
} from "./keyboards.js";
import { logger } from "../lib/logger.js";

export interface WizardData extends ScenesType.WizardSessionData {
  name?: string;
  phone?: string;
  age?: number;
  selectedCategories?: string[];
  selectedDistricts?: string[];
  category?: string;
  district?: string;
  salary?: string;
  workType?: string;
  ageMin?: number;
  ageMax?: number;
  description?: string;
  jobId?: number;
}

export interface BotSession extends ScenesType.SceneSession<WizardData> {
  __wizard?: WizardData;
}

export interface BotContext extends Context {
  session: BotSession & WizardData;
  scene: ScenesType.SceneContextScene<BotContext, WizardData>;
  wizard: ScenesType.WizardContextWizard<BotContext>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function showRoleSelector(ctx: BotContext, intro = false) {
  const telegramId = ctx.from!.id;
  const profile = queries.getProfile.get(telegramId);
  const hasEmployer = !!queries.getEmployerByTelegramId.get(telegramId);
  const hasWorker = !!queries.getWorkerByTelegramId.get(telegramId);

  let hint = "";
  if (hasEmployer && hasWorker) {
    hint = "\n\n✅ Ikkala rolda ham ro'yxatdansiz. Rolni tanlang:";
  } else if (hasEmployer) {
    hint = "\n\n✅ Ish beruvchi sifatida ro'yxatdansiz.";
  } else if (hasWorker) {
    hint = "\n\n✅ Ishchi sifatida ro'yxatdansiz.";
  }

  const activeRole = profile?.active_role;
  const currentRoleText = activeRole
    ? `\n🔵 Hozirgi rol: ${activeRole === "employer" ? "Ish beruvchi" : "Ishchi"}`
    : "";

  const greeting = intro
    ? `👋 *Toshish Bot*ga xush kelibsiz!\n\nBu bot orqali:\n• 💼 Ish beruvchilar vakansiya joylashlari mumkin\n• 👷 Ishchilar kunlik mos ish o'rinlarini topishlari mumkin`
    : `🔄 Rol tanlash`;

  await ctx.reply(
    `${greeting}${currentRoleText}${hint}\n\nQaysi sifatda davom etasiz?`,
    { parse_mode: "Markdown", ...roleSelectorKeyboard }
  );
}

async function enterEmployerMode(ctx: BotContext) {
  const telegramId = ctx.from!.id;
  queries.upsertProfile.run(telegramId);
  queries.setActiveRole.run("employer", telegramId);

  const employer = queries.getEmployerByTelegramId.get(telegramId);
  if (employer) {
    await ctx.reply(
      `💼 Xush kelibsiz, *${employer.name}*!\n🏢 Kompaniya: ${employer.company_name}`,
      { parse_mode: "Markdown", ...employerMenuKeyboard }
    );
  } else {
    await ctx.reply(
      "💼 *Ish beruvchi* sifatida ro'yxatdan o'tish uchun bir necha qadam bosing:",
      { parse_mode: "Markdown" }
    );
    await ctx.scene.enter("employer_register");
  }
}

async function enterWorkerMode(ctx: BotContext) {
  const telegramId = ctx.from!.id;
  queries.upsertProfile.run(telegramId);
  queries.setActiveRole.run("worker", telegramId);

  const worker = queries.getWorkerByTelegramId.get(telegramId);
  if (worker) {
    let categories: string[] = [];
    let districts: string[] = [];
    try {
      categories = JSON.parse(worker.categories) as string[];
      districts = JSON.parse(worker.districts) as string[];
    } catch { /* empty */ }
    await ctx.reply(
      `👷 Xush kelibsiz, *${worker.name}*!\n` +
      `💼 ${categories.join(", ")}\n📍 ${districts.join(", ")}`,
      { parse_mode: "Markdown", ...workerMenuKeyboard }
    );
  } else {
    await ctx.reply(
      "👷 *Ishchi* sifatida ro'yxatdan o'tish uchun bir necha qadam bosing:",
      { parse_mode: "Markdown" }
    );
    await ctx.scene.enter("worker_register");
  }
}

// ─── Bot factory ─────────────────────────────────────────────────────────────

export function createBot(): Telegraf<BotContext> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const bot = new Telegraf<BotContext>(token);

  const stage = new Scenes.Stage<BotContext>([
    employerRegisterScene,
    employerPostJobScene,
    workerRegisterScene,
  ]);

  bot.use(session());
  bot.use(stage.middleware());

  setupAdminHandlers(bot);
  setupScheduler(bot);

  // ─── /start — always shows role selector ────────────────────────────────────
  bot.start(async (ctx) => {
    await showRoleSelector(ctx, true);
  });

  // ─── Role selection ──────────────────────────────────────────────────────────
  bot.hears("🔍 Ish qidiraman", (ctx) => enterWorkerMode(ctx));
  bot.hears("💼 Ish beraman", (ctx) => enterEmployerMode(ctx));
  bot.hears("🔄 Rolni almashtirish", (ctx) => showRoleSelector(ctx, false));

  // ─── Employer menu ───────────────────────────────────────────────────────────
  bot.hears("📋 Vakansiya joylash", async (ctx) => {
    const telegramId = ctx.from.id;
    const profile = queries.getProfile.get(telegramId);
    if (profile?.active_role !== "employer") {
      await ctx.reply("Iltimos, avval ish beruvchi rolini tanlang.");
      return;
    }
    const employer = queries.getEmployerByTelegramId.get(telegramId);
    if (!employer) {
      await ctx.scene.enter("employer_register");
      return;
    }
    await ctx.scene.enter("employer_post_job");
  });

  bot.hears("📊 Mening vakansiyalarim", async (ctx) => {
    const telegramId = ctx.from.id;
    const employer = queries.getEmployerByTelegramId.get(telegramId);
    if (!employer) return;

    queries.expireOldJobs.run();
    const allJobs = queries.getJobsByEmployerId.all(employer.id);
    const shown = allJobs.filter((j) => j.status === "active" || j.status === "pending");

    if (shown.length === 0) {
      await ctx.reply("Hozircha vakansiyalaringiz yo'q.");
      return;
    }

    await ctx.reply(`📋 Vakansiyalaringiz (${shown.length} ta):`);

    for (const job of shown) {
      const isActive = job.status === "active";
      const daysLeft = isActive && job.expires_at
        ? Math.ceil((job.expires_at - Math.floor(Date.now() / 1000)) / 86400)
        : null;

      const statusLine = isActive
        ? `✅ Faol | ⏳ ${daysLeft} kun qoldi`
        : `⏳ Admin tasdiqlashini kutmoqda`;

      const text =
        `*${job.category}* — ${job.district}\n` +
        `💰 ${job.salary} | 🕐 ${job.work_type}\n` +
        `👤 Yosh: ${job.age_min}–${job.age_max}\n` +
        `${statusLine}`;

      const { Markup } = await import("telegraf");
      await ctx.reply(text, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🗑 O'chirish", `del_ask_${job.id}`)],
        ]),
      });
    }
  });

  // ─── Job deletion callbacks ───────────────────────────────────────────────────
  bot.action(/^del_ask_(\d+)$/, async (ctx) => {
    const jobId = parseInt(ctx.match[1]!);
    const job = queries.getJobById.get(jobId);
    if (!job) {
      await ctx.answerCbQuery("E'lon topilmadi.");
      return;
    }
    const { Markup } = await import("telegraf");
    await ctx.answerCbQuery();
    await ctx.reply(
      `❓ Rostdan ham bu e'lonni o'chirmoqchimisiz?\n\n*${job.category}* — ${job.district}\n💰 ${job.salary}`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Ha, o'chir", `del_confirm_${jobId}`),
            Markup.button.callback("❌ Yo'q", `del_cancel_${jobId}`),
          ],
        ]),
      }
    );
  });

  bot.action(/^del_confirm_(\d+)$/, async (ctx) => {
    const jobId = parseInt(ctx.match[1]!);
    const job = queries.getJobById.get(jobId);
    if (!job) {
      await ctx.answerCbQuery("E'lon topilmadi.");
      return;
    }
    queries.deleteJob.run(jobId);
    await ctx.answerCbQuery("✅ E'lon o'chirildi!");
    await ctx.editMessageText(`🗑 E'lon o'chirildi: *${job.category}* — ${job.district}`, {
      parse_mode: "Markdown",
    });
  });

  bot.action(/^del_cancel_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery("Bekor qilindi.");
    await ctx.deleteMessage();
  });

  // ─── Worker menu ─────────────────────────────────────────────────────────────
  bot.hears("📌 Mening ma'lumotlarim", async (ctx) => {
    const telegramId = ctx.from.id;
    const worker = queries.getWorkerByTelegramId.get(telegramId);
    if (!worker) return;

    let categories: string[] = [];
    let districts: string[] = [];
    try {
      categories = JSON.parse(worker.categories) as string[];
      districts = JSON.parse(worker.districts) as string[];
    } catch { /* empty */ }

    await ctx.reply(
      `👤 *Mening ma'lumotlarim:*\n\n` +
      `📛 Ism: ${worker.name}\n` +
      `📞 Telefon: ${worker.phone}\n` +
      `🎂 Yosh: ${worker.age}\n` +
      `💼 Kategoriyalar: ${categories.join(", ")}\n` +
      `📍 Tumanlar: ${districts.join(", ")}\n\n` +
      `🔔 Har kuni soat 09:00 da mos vakansiyalar yuboriladi.`,
      { parse_mode: "Markdown" }
    );
  });

  // ─── Donate ───────────────────────────────────────────────────────────────────
  bot.hears("💝 Bizni qo'llash", async (ctx) => {
    await ctx.reply(
      `💝 *Bizni qo'llash*\n\n` +
      `Agar bot sizga foydali bo'lsa, istalgan miqdorda yordam bera olasiz!\n\n` +
      `💳 Karta raqami: \`5614684702056944\`\n` +
      `👤 Nosirjon Karimov\n\n` +
      `Rahmat! 🙏`,
      { parse_mode: "Markdown" }
    );
  });

  // ─── Error handler ────────────────────────────────────────────────────────────
  bot.catch((err, ctx) => {
    logger.error({ err, update: ctx.update }, "Bot error");
  });

  return bot;
}
