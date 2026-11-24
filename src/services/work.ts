/**
 * Long-running work (contact import, template download), tracked in the app.
 *
 * Each job is bound to the account it was started for: the task receives that
 * account id and must use it for every request, so switching accounts midway
 * never moves the work. `useJobs()` shows progress in the app. There is no
 * background service: a job carries on only while the app is open.
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export type Job = { id: string; acct: string; label: string; done: number; total: number };

type State = { jobs: Job[] };
export const useWorkStore = create<State>()(() => ({ jobs: [] }));

const patchJob = (id: string, p: Partial<Job>) => useWorkStore.setState((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...p } : j)) }));

/** Runs `task` as a job for `acct`, with progress shown in the app. Resolves with the task's result. */
export const runJob = async <T>(acct: string, label: string, task: (acct: string, progress: (done: number, total: number) => void) => Promise<T>): Promise<T> => {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  useWorkStore.setState((s) => ({ jobs: [...s.jobs, { id, acct, label, done: 0, total: 0 }] }));
  try {
    return await task(acct, (done, total) => {
      patchJob(id, { done, total });
    });
  } finally {
    useWorkStore.setState((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }));
  }
};

export const useJobs = (acct?: string | null) => useWorkStore(useShallow((s) => (acct === undefined ? s.jobs : s.jobs.filter((j) => j.acct === acct))));
