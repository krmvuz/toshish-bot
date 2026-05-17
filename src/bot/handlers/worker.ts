import { Scenes } from "telegraf";
import type { BotContext } from "../index.js";
import { queries } from "../db.js";
import {
  categoriesInlineKeyboard,
  districtsInlineKeyboard,
  workerMenuKeyboard,
} from "../keyboards.js";

export const workerRegisterScene = new Scenes.WizardScene<BotContext>(
  "worker_register",
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
      await ctx.reply("Iltimos, telefon raqamini kiriting.");
      return;
    }
    ctx.session.phone = ctx.message.text.trim();
    await ctx.reply("🎂 Yoshingizni kiriting (masalan: 25):");
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) {
      await ctx.reply("Iltimos, yoshingizni kiriting.");
      return;
    }
    const age = parseInt(ctx.message.text.trim());
    if (isNaN(age) || age < 14 || age > 80) {
      await ctx.reply("Iltimos, to'g'ri yosh kiriting (14-80).");
      return;
    }
    ctx.session.age = age;
    ctx.session.selectedCategories = [];
    await ctx.reply(
      "💼 Qaysi sohalarda ishlashni xohlaysiz? (bir nechta tanlash mumkin)\nTugagandan so'ng ✅ Tasdiqlash tugmasini bosing:",
      categoriesInlineKeyboard([])
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }
    const data = ctx.callbackQuery.data;
    if (data === "cat_done") {
      if (!ctx.session.selectedCategories?.length) {
        await ctx.answerCbQuery("Kamida bitta kategoriya tanlang!");
        return;
      }
      await ctx.answerCbQuery();
      ctx.session.selectedDistricts = [];
      await ctx.editMessageText(
        `✅ Tanlangan kategoriyalar: ${ctx.session.selectedCategories.join(", ")}\n\n` +
        `Qaysi tumanlarni qabul qilasiz? (bir nechta tanlash mumkin)\nTugagandan so'ng ✅ Tasdiqlash tugmasini bosing:`,
        districtsInlineKeyboard([])
      );
      return ctx.wizard.next();
    }
    if (data.startsWith("cat_")) {
      const cat = data.replace("cat_", "");
      const selected = ctx.session.selectedCategories ?? [];
      const idx = selected.indexOf(cat);
      if (idx >= 0) selected.splice(idx, 1);
      else selected.push(cat);
      ctx.session.selectedCategories = selected;
      await ctx.answerCbQuery();
      await ctx.editMessageReplyMarkup(categoriesInlineKeyboard(selected).reply_markup);
    }
    return;
  },
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }
    const data = ctx.callbackQuery.data;
    if (data === "dist_done") {
      if (!ctx.session.selectedDistricts?.length) {
        await ctx.answerCbQuery("Kamida bitta tuman tanlang!");
        return;
      }
      await ctx.answerCbQuery();

      const telegramId = ctx.from!.id;
      const { name, phone, age, selectedCategories, selectedDistricts } = ctx.session;

      queries.upsertProfile.run(telegramId);
      queries.setActiveRole.run("worker", telegramId);
      queries.createWorker.run(
        telegramId,
        name!,
        phone!,
        age!,
        JSON.stringify(selectedCategories),
        JSON.stringify(selectedDistricts)
      );

      await ctx.editMessageText(
        `✅ Muvaffaqiyatli ro'yxatdan o'tdingiz!\n\n` +
        `👤 Ism: ${name}\n` +
        `📞 Telefon: ${phone}\n` +
        `🎂 Yosh: ${age}\n` +
        `💼 Kategoriyalar: ${selectedCategories!.join(", ")}\n` +
        `📍 Tumanlar: ${selectedDistricts!.join(", ")}\n\n` +
        `🔔 Har kuni ertalab soat 09:00 da sizga mos vakansiyalar yuboriladi.`
      );
      await ctx.reply("Asosiy menyu:", workerMenuKeyboard);
      return ctx.scene.leave();
    }
    if (data.startsWith("dist_")) {
      const dist = data.replace("dist_", "");
      const selected = ctx.session.selectedDistricts ?? [];
      const idx = selected.indexOf(dist);
      if (idx >= 0) selected.splice(idx, 1);
      else selected.push(dist);
      ctx.session.selectedDistricts = selected;
      await ctx.answerCbQuery();
      await ctx.editMessageReplyMarkup(districtsInlineKeyboard(selected).reply_markup);
    }
  }
);
