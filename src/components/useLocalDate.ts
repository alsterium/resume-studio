import { useEffect, useState } from "react";
import { localDate } from "../domain/dates";

export function useLocalDate() {
  const [today, setToday] = useState(() => localDate());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(update, Math.max(1000, midnight.getTime() - now.getTime() + 25));
    };
    const update = () => {
      setToday(localDate());
      schedule();
    };
    schedule();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return today;
}
