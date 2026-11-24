/**
 * Android background sync.
 *
 * A WorkManager job (expo-background-task) runs every ~15 minutes, even when
 * the app is closed, adds new phone contacts to every signed-in account
 * that turned auto-add on, and re-arms Visits' yearly wishes (birthdays…). Android decides the exact timing (battery, Doze);
 * 15 minutes is the shortest interval it allows.
 *
 * `defineTask` must run at module load, before React mounts, so the OS can
 * start the JS runtime headless and find the task. The root layout imports
 * this file first for that reason.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { hydrateTokens, tokenFor, useAccountsStore } from '@/stores/accounts';

export const BACKGROUND_SYNC_TASK = 'fcrm-background-sync';

if (Platform.OS === 'android') {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    try {
      // A headless start has no tokens in memory yet.
      await hydrateTokens();
      if (!useAccountsStore.getState().sessions.length) return BackgroundTask.BackgroundTaskResult.Success;
      // Imported lazily so a headless start loads only what the sync needs.
      // New phone contacts → CRM, for accounts that turned auto-add on.
      const { autoAddNewContacts } = await import('@/services/contactsSync');
      for (const s of useAccountsStore.getState().sessions) if (tokenFor(s.id)) await autoAddNewContacts(s.id).catch(() => 0);
      // Visits: re-arm next year's birthday / anniversary wishes, even when the app isn't opened.
      const { sweepAllOccasions } = await import('@/services/crm/services');
      await sweepAllOccasions().catch(() => undefined);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Schedules the periodic job (idempotent). Called after sign-in. */
export const registerBackgroundSync = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return false;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK))) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
    }
    return true;
  } catch {
    return false;
  }
};

/** Stops the job when the last account signs out. */
export const unregisterBackgroundSync = async () => {
  if (Platform.OS !== 'android') return;
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK).catch(() => false)) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK).catch(() => undefined);
  }
};
