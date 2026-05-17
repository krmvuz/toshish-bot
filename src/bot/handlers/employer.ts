import { Scenes, Markup } from "telegraf";
import type { BotContext } from "../index.js";
import { queries } from "../db.js";
import {
  singleCategoryKeyboard,
  singleDistrictKeyboard,
  workTypeKeyboard,
  employerMenuKeyboard,
  paymentConfirmKeyboard,
} from "../keyboards.js";
import { PAYMENT_CARD, PAYMENT_OWNER, PAYMENT_AMOUNT, JOB_ACTIVE_DAYS } from "../constants.js";

// ─── Registration Wizard ─────────────────────────────────────────────────────

export const employerRegisterScene = new Scenes.WizardScene<BotContext>(
  "employer_register",
  async (ctx) => {
    await ctx.reply("👤 Ismingizni kiriting:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) {
      await ctx.reply("Iltimos, ismingizni matn ko'rinishida kiriting.");
      return;
    }
    ctx.session.name = ctx.message.text.trim();
    await ctx.reply("📞 Telefon raqamingizni kiriting:\n(Masalan: +998901234567)");
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) {
      await ctx.reply("Iltimos, telefon raqamini matn ko'rinishida kiriting.");
      return;
    }
    ctx.session.phone = ctx.message.text.trim();
    await ctx.reply("🏢 Kompaniya / korxona nomini kiriting:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) {
      await ctx.reply("Iltimos, kompaniya nomini matn ko'rinishida kiriting.");
      return;
    }
    const companyName = ctx.message.text.trim();
    const telegramId = ctx.from!.id;
    const { name, phone } = ctx.session;

    queries.upsertProfile.run(telegramId);
    queries.setActiveRole.run("employer", telegramId);
    queries.createEmployer.run(telegramId, name!, phone!, companyName);

    await ctx.reply(
      `✅ Muvaffaqiyatli ro'yxatdan o'tdingiz!\n\n` +
      `👤 Ism: ${name}\n📞 Telefon: ${phone}\n🏢 Kompaniya: ${companyName}`,
      employerMenuKeyboard
    );
    return ctx.scene.leave();
  }
);

// ─── Post Job Wizard ──────────────────────────────────────────────────────────

export const employerPostJobScene = new Scenes.WizardScene<BotContext>(
  "employer_post_job",
  async (ctx) => {
    await ctx.reply("📋 Kategoriyani tanlang:", singleCategoryKeyboard());
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      await ctx.reply("Iltimos, kategoriyani tanlang.");
      return;
    }
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("scat_")) return;
    ctx.session.category = data.replace("scat_", "");
    await ctx.answerCbQuery();
    await ctx.reply("📍 Tumanni tanlang:", singleDistrictKeyboard());
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      await ctx.reply("Iltimos, tumanni tanlang.");
      return;
    }
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("sdist_")) return;
    ctx.session.district = data.replace("sdist_", "");
    await ctx.answerCbQuery();
    await ctx.reply("💰 Maosh miqdorini kiriting (masalan: 50000 so'm/kun yoki 2,000,000 so'm/oy):");
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) {
      await ctx.reply("Iltimos, maoshni kiriting.");
      return;
    }
    ctx.session.salary = ctx.message.text.trim();
    await ctx.reply("🕐 Ish turini tanlang:", workTypeKeyboard());
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) {
      await ctx.reply("Iltimos, ish turini tanlang.");
      return;
    }
    const workType = ctx.message.text.trim();
    if (!["Kunlik", "Oylik"].includes(workType)) {
      await ctx.reply("Iltimos, ro'yxatdan tanlang.");
      return;
    }
    ctx.session.workType = workType;
    await ctx.reply(
      "👤 Yosh chegarasini kiriting:\nMinimal yosh (masalan: 18):",
      Markup.removeKeyboard()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) {
      await ctx.reply("Iltimos, minimal yoshni kiriting.");
      return;
    }
    const ageMin = parseInt(ctx.message.text.trim());
    if (isNaN(ageMin) || ageMin < 14 || ageMin > 80) {
      await ctx.reply("Iltimos, to'g'ri yosh kiriting (14-80).");
      return;
    }
    ctx.session.ageMin = ageMin;
    await ctx.reply("👤 Maksimal yosh (masalan: 35):");
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) {
      await ctx.reply("Iltimos, maksimal yoshni kiriting.");
      return;
    }
    const ageMax = parseInt(ctx.message.text.trim());
    if (isNaN(ageMax) || ageMax < (ctx.session.ageMin ?? 0) || ageMax > 80) {
      await ctx.reply("Iltimos, minimal yoshdan katta raqam kiriting.");
      return;
    }
    ctx.session.ageMax = ageMax;
    await ctx.reply("📝 Ish haqida qisqacha tavsif yozing:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) {
      await ctx.reply("Iltimos, tavsif kiriting.");
      return;
    }
    ctx.session.description = ctx.message.text.trim();

    const telegramId = ctx.from!.id;
    const employer = queries.getEmployerByTelegramId.get(telegramId)!;

    const jobResult = queries.createJob.run(
      employer.id,
      ctx.session.category!,
      ctx.session.district!,
      ctx.session.salary!,
      ctx.session.workType!,
      ctx.session.ageMin!,
      ctx.session.ageMax!,
      ctx.session.description!
    );
    const jobId = Number(jobResult.lastInsertRowid);
    ctx.session.jobId = jobId;

    await ctx.reply(
      `💳 To'lov ma'lumotlari:\n\n` +
      `💰 Miqdor: ${PAYMENT_AMOUNT.toLocaleString()} UZS\n` +
      `💳 Karta: \`${PAYMENT_CARD}\`\n` +
      `👤 Egasi: ${PAYMENT_OWNER}\n\n` +
      `To'lovni amalga oshirgach, chekni (screenshot) yuboring.`,
      { parse_mode: "Markdown" }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !("photo" in ctx.message)) {
      await ctx.reply("📸 Iltimos, to'lov chekini rasm ko'rinishida yuboring.");
      return;
    }
    const photo = ctx.message.photo;
    const fileId = photo[photo.length - 1]!.file_id;
    const jobId = ctx.session.jobId!;

    queries.setJobPaymentScreenshot.run(fileId, jobId);

    const adminId = process.env["ADMIN_TELEGRAM_ID"];
    if (adminId) {
      const telegramId = ctx.from!.id;
      const employer = queries.getEmployerByTelegramId.get(telegramId)!;
      const job = queries.getJobById.get(jobId)!;

      try {
        await ctx.telegram.sendPhoto(parseInt(adminId), fileId, {
          caption:
            `💳 Yangi to'lov tasdiqlash so'rovi\n\n` +
            `👤 Ish beruvchi: ${employer.name}\n` +
            `🏢 Kompaniya: ${employer.company_name}\n` +
            `📞 Telefon: ${employer.phone}\n` +
            `📋 Kategoriya: ${job.category}\n` +
            `📍 Tuman: ${job.district}\n` +
            `💰 Maosh: ${job.salary}\n` +
            `🆔 Ish ID: ${jobId}`,
          reply_markup: paymentConfirmKeyboard(jobId).reply_markup,
        });
      } catch {
        // Admin notification failed silently
      }
    }

    await ctx.reply(
      "✅ To'lov cheki yuborildi!\n\nAdmin tekshirib, vakansiyangizni tasdiqlaydi. Tez orada xabar olasiz.",
      employerMenuKeyboard
    );
    return ctx.scene.leave();
  }
);
