import { useState } from "react";

/** Tanggal "hari ini" yang stabil selama komponen hidup (hindari new Date() di render). */
export function useToday() {
  const [today] = useState(() => new Date());
  return today;
}
