/* Brand and plan ids normally come from .env; tests use fixed stand-ins. */
Object.assign(process.env, {
  EXPO_PUBLIC_APP_NAME: 'Test Followups',
  EXPO_PUBLIC_BRAND_NAME: 'Test',
  EXPO_PUBLIC_FREE_PLAN_IDS: 'test-free-plan, test-trial-plan',
  EXPO_PUBLIC_STARTING_PLAN_DURATION: '7d',
  EXPO_PUBLIC_PAID_PLAN_IDS: 'test-paid-plan,test-gold-plan',
  EXPO_PUBLIC_DATASTORE_PLAN_ID: 'test-datastore-plan',
});

/* Native modules have no implementation under Jest; give them in-memory stand-ins. */
jest.mock('react-native-mmkv', () => {
  const mem = new Map<string, string | number | boolean>();
  const store = {
    getString: (k: string) => (typeof mem.get(k) === 'string' ? (mem.get(k) as string) : undefined),
    getNumber: (k: string) => (typeof mem.get(k) === 'number' ? (mem.get(k) as number) : undefined),
    getBoolean: (k: string) => (typeof mem.get(k) === 'boolean' ? (mem.get(k) as boolean) : undefined),
    set: (k: string, v: string | number | boolean) => void mem.set(k, v),
    contains: (k: string) => mem.has(k),
    remove: (k: string) => mem.delete(k),
    clearAll: () => mem.clear(),
    getAllKeys: () => [...mem.keys()],
  };
  return { createMMKV: () => store };
});

jest.mock('expo-secure-store', () => {
  const mem = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => mem.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void mem.set(k, v),
    deleteItemAsync: async (k: string) => void mem.delete(k),
  };
});

jest.mock('@react-native-firebase/messaging', () => ({ getMessaging: () => ({}), getToken: async () => null }));

jest.mock('expo-contacts', () => ({ Contact: { getAllDetails: async () => [] }, ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' } }));

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
