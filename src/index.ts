import app from "./app";
import { logger } from "./lib/logger";
import { createBot } from "./bot/index";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// Start Telegram bot
try {
  const bot = createBot();

  // Verify token and log bot identity before launching
  bot.telegram.getMe().then((me) => {
    logger.info({ username: me.username, id: me.id }, "Telegram bot connected");
  }).catch((err) => {
    logger.error({ err }, "Telegram bot token verification failed");
  });

  bot.launch({ dropPendingUpdates: true }).catch((err) => {
    logger.error({ err }, "Telegram bot polling error");
  });

  // Graceful shutdown
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
} catch (err) {
  logger.error({ err }, "Failed to create Telegram bot");
}
