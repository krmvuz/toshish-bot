import cron from "node-cron";
import type { Telegraf } from "telegraf";
import type { BotContext } from "./index.js";
import { queries } from "./db.js";
import { logger } from "../lib/logger.js";

export function setupScheduler(bot: Telegraf<BotContext>) {
  // Run every day at 09:00 Tashkent time (UTC+5 = 04:00 UTC)
  cron.schedule("0 4 * * *", async () => {
    logger.info("Running daily job notification scheduler");
    await sendDailyJobNotifications(bot);
  });
}

export async function sendDailyJobNotifications(bot: Telegraf<BotContext>) {
  queries.expireOldJobs.run();

  const activeJobs = queries.getActiveJobs.all();
  if (activeJobs.length === 0) {
    logger.info("No active jobs to send");
    return;
  }

  const workers = queries.getAllWorkersForNotifications.all();
  if (workers.length === 0) {
    logger.info("No workers registered");
    return;
  }

  let notificationsSent = 0;

  for (const worker of workers) {
    let workerCategories: string[] = [];
    let workerDistricts: string[] = [];

    try {
      workerCategories = JSON.parse(worker.categories) as string[];
      workerDistricts = JSON.parse(worker.districts) as string[];
    } catch {
      continue;
    }

    const matchingJobs = activeJobs.filter(
      (job) =>
        workerCategories.includes(job.category) &&
        workerDistricts.includes(job.district)
    );

    if (matchingJobs.length === 0) continue;

    let message =
      `🌅 Xayrli tong! Bugungi mos vakansiyalar:\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const job of matchingJobs) {
      const employer = queries.getEmployerByEmployerId.get(job.employer_id);
      message +=
        `💼 *${job.category}*\n` +
        `📍 Tuman: ${job.district}\n` +
        `💰 Maosh: ${job.salary}\n` +
        `🕐 Ish turi: ${job.work_type}\n` +
        `👤 Yosh: ${job.age_min}–${job.age_max}\n` +
        `📞 Telefon: ${employer ? employer.phone : "—"}\n`;

      if (job.description) {
        message += `📝 ${job.description}\n`;
      }
      message += `\n`;
    }

    try {
      await bot.telegram.sendMessage(worker.telegram_id, message, {
        parse_mode: "Markdown",
      });
      notificationsSent++;
    } catch (e) {
      logger.warn(
        { err: e, telegram_id: worker.telegram_id },
        "Failed to send job notification to worker"
      );
    }
  }

  logger.info({ notificationsSent }, "Daily job notifications sent");
}
