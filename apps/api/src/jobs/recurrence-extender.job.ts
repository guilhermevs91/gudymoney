import cron from 'node-cron';
import { recurrencesService } from '../modules/recurrences/recurrences.service';

/**
 * Recurrence Horizon Extender — runs daily at 02:00 America/Sao_Paulo.
 *
 * Finds all active infinite recurrences whose `horizon_generated_until` is
 * less than 3 months from now, then generates the next 3 months of PREVISTO
 * transactions and advances the horizon marker.
 */
export function startRecurrenceExtenderJob(): void {
  cron.schedule(
    '0 2 * * *',
    async () => {
      console.log('[CRON] Starting recurrence horizon extension...');
      try {
        const extended = await recurrencesService.extendInfiniteRecurrences();
        console.log(
          `[CRON] Recurrence horizon extension complete. Extended ${extended} recurrence(s).`,
        );
      } catch (err) {
        console.error('[CRON] Recurrence extender failed:', err);
      }
    },
    { timezone: 'America/Sao_Paulo' },
  );

  console.log('[CRON] Recurrence extender job scheduled (daily at 02:00 BRT).');
}
