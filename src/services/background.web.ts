/** The web build has no background jobs. */
export const BACKGROUND_SYNC_TASK = 'fcrm-background-sync';
export const registerBackgroundSync = async (): Promise<boolean> => false;
export const unregisterBackgroundSync = async () => undefined;
