import { useEffect, useState } from 'react';

/** `value`, once it has stopped changing for `ms` (typed search: one request per pause, not per key). */
export const useDebounced = <T>(value: T, ms = 300): T => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
};
