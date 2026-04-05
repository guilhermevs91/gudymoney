import app from './app';
import { env } from './config/env';
import { startRecurrenceExtenderJob } from './jobs/recurrence-extender.job';
import { startWebhookSenderJob } from './jobs/webhook-sender.job';
import { startNotificationGeneratorJob } from './jobs/notification-generator.job';

const { PORT } = env;

app.listen(PORT, () => {
  console.warn(`Gudy Money API running on port ${PORT}`);

  // Start all background cron jobs after the server is up
  startRecurrenceExtenderJob();
  startWebhookSenderJob();
  startNotificationGeneratorJob();
  console.log('[JOBS] All cron jobs started');
});
