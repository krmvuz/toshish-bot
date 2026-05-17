import type { Telegraf } from "telegraf";
import type { BotContext } from "../index.js";
import { queries } from "../db.js";
import { paymentConfirmKeyboard } from "../keyboards.js";
import { JOB_ACTIVE_DAYS } from "../constants.js";
import { logger } from "../../lib/logger.js";

export function setupAdminHandlers(bot: Telegraf<BotContext>) {
  const ADMIN_ID = parseInt(process.env["ADMIN_TELEGRAM_ID"] || "0");

  function isAdmin(ctx: BotContext): boolean {
    return ctx.from?.id === ADMIN_ID;
  }

  bot.command("stats", async (ctx) => {
    if (!isAdmin(ctx)) return;

    queries.expireOldJobs.run();
    const profiles = queries.countProfiles.get()!;
    const employers = queries.countEmployers.get()!;
    const workers = queries.countWorkers.get()!;
    const activeJobs = queries.countActiveJobs.get()!;

    await ctx.reply(
      `📊 Bot statistikasi:\n\n` +
      `👥 Jami foydalanuvchilar: ${profiles.total}\n` +
      `💼 Ish beruvchilar: ${employers.total}\n` +
      `👷 Ishchilar: ${workers.total}\n` +
      `📋 Faol vakansiyalar: ${activeJobs.count}`
    );
  });

  bot.command("broadcast", async (ctx) => {
    if (!isAdmin(ctx)) return;

    const text = ctx.message.text.replace("/broadcast", "").trim();
    if (!text) {
      await ctx.reply("Xabar matnini kiriting:\n/broadcast <xabar matni>");
      return;
    }

    const users = queries.getAllTelegramIds.all();
    let sent = 0;
    let failed = 0;

    for (const u of users) {
      try {
        await bot.telegram.sendMessage(u.telegram_id, text);
        sent++;
      } catch {
        failed++;
      }
    }

    await ctx.reply(`✅ Xabar yuborildi:\n✔️ Muvaffaqiyatli: ${sent}\n❌ Xato: ${failed}`);
  });

  bot.action(/^confirm_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.answerCbQuery("Siz admin emassiz!");
      return;
    }
    const jobId = parseInt(ctx.match[1]!);
    const job = queries.getJobById.get(jobId);

    if (!job) {
      await ctx.answerCbQuery("Vakansiya topilmadi!");
      return;
    }
    if (job.status !== "pending") {
      await ctx.answerCbQuery(`Vakansiya allaqachon: ${job.status}`);
      return;
    }

    queries.activateJob.run(JOB_ACTIVE_DAYS, jobId);

    const employer = queries.getEmployerByEmployerId.get(job.employer_id);
    if (employer) {
      try {
        await bot.telegram.sendMessage(
          employer.telegram_id,
          `✅ Vakansiyangiz tasdiqlandi!\n\n` +
          `📋 Kategoriya: ${job.category}\n` +
          `📍 Tuman: ${job.district}\n` +
          `💰 Maosh: ${job.salary}\n\n` +
          `Vakansiya ${JOB_ACTIVE_DAYS} kun davomida faol bo'ladi.`
        );
      } catch (e) {
        logger.error({ err: e }, "Failed to notify employer");
      }
    }

    await ctx.answerCbQuery("✅ Vakansiya tasdiqlandi!");
    const oldCaption =
      ctx.callbackQuery.message && "caption" in ctx.callbackQuery.message
        ? ctx.callbackQuery.message.caption ?? ""
        : "";
    await ctx.editMessageCaption(`${oldCaption}\n\n✅ TASDIQLANDI`, {
      reply_markup: undefined,
    });
  });

  bot.action(/^reject_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.answerCbQuery("Siz admin emassiz!");
      return;
    }
    const jobId = parseInt(ctx.match[1]!);
    const job = queries.getJobById.get(jobId);

    if (!job) {
      await ctx.answerCbQuery("Vakansiya topilmadi!");
      return;
    }

    queries.rejectJob.run(jobId);

    const employer = queries.getEmployerByEmployerId.get(job.employer_id);
    if (employer) {
      try {
        await bot.telegram.sendMessage(
          employer.telegram_id,
          `❌ Vakansiyangiz rad etildi.\n\n` +
          `📋 Kategoriya: ${job.category}\n` +
          `📍 Tuman: ${job.district}\n\n` +
          `Savollar uchun admin bilan bog'laning.`
        );
      } catch (e) {
        logger.error({ err: e }, "Failed to notify employer about rejection");
      }
    }

    await ctx.answerCbQuery("❌ Vakansiya rad etildi.");
    const oldCaption =
      ctx.callbackQuery.message && "caption" in ctx.callbackQuery.message
        ? ctx.callbackQuery.message.caption ?? ""
        : "";
    await ctx.editMessageCaption(`${oldCaption}\n\n❌ RAD ETILDI`, {
      reply_markup: undefined,
    });
  });
}
