import { Markup } from "telegraf";
import { CATEGORIES, DISTRICTS, WORK_TYPES } from "./constants.js";

export const roleSelectorKeyboard = Markup.keyboard([
  ["🔍 Ish qidiraman"],
  ["💼 Ish beraman"],
])
  .resize()
  .oneTime();

export const employerMenuKeyboard = Markup.keyboard([
  ["📋 Vakansiya joylash"],
  ["📊 Mening vakansiyalarim"],
  ["🔄 Rolni almashtirish", "💝 Bizni qo'llash"],
])
  .resize()
  .persistent();

export const workerMenuKeyboard = Markup.keyboard([
  ["📌 Mening ma'lumotlarim"],
  ["🔄 Rolni almashtirish", "💝 Bizni qo'llash"],
])
  .resize()
  .persistent();

export const categoriesInlineKeyboard = (selected: string[] = []) => {
  const buttons = CATEGORIES.map((cat) => {
    const isSelected = selected.includes(cat);
    return Markup.button.callback(
      `${isSelected ? "✅ " : ""}${cat}`,
      `cat_${cat}`
    );
  });
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  rows.push([Markup.button.callback("✅ Tasdiqlash", "cat_done")]);
  return Markup.inlineKeyboard(rows);
};

export const districtsInlineKeyboard = (selected: string[] = []) => {
  const buttons = DISTRICTS.map((d) => {
    const isSelected = selected.includes(d);
    return Markup.button.callback(
      `${isSelected ? "✅ " : ""}${d}`,
      `dist_${d}`
    );
  });
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  rows.push([Markup.button.callback("✅ Tasdiqlash", "dist_done")]);
  return Markup.inlineKeyboard(rows);
};

export const singleCategoryKeyboard = () => {
  const buttons = CATEGORIES.map((cat) =>
    Markup.button.callback(cat, `scat_${cat}`)
  );
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  return Markup.inlineKeyboard(rows);
};

export const singleDistrictKeyboard = () => {
  const buttons = DISTRICTS.map((d) =>
    Markup.button.callback(d, `sdist_${d}`)
  );
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  return Markup.inlineKeyboard(rows);
};

export const workTypeKeyboard = () =>
  Markup.keyboard(WORK_TYPES.map((w) => [w]))
    .resize()
    .oneTime();

export const paymentConfirmKeyboard = (jobId: number) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Tasdiqlash", `confirm_${jobId}`),
      Markup.button.callback("❌ Rad etish", `reject_${jobId}`),
    ],
  ]);
