import { useCallback, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/client";
import { AI_NOT_CONFIGURED, useAi } from "@/lib/ai/use-ai";
import { APP_ICONS, resolveIconKey } from "./icon-registry";

/** Maksimum saran ikon dari AI. */
export const MAX_ICON_SUGGESTIONS = 6;

/**
 * Prompt pemilihan ikon: daftar seluruh key registry (key, label, kata kunci) agar AI hanya memilih ikon yang ada.
 * `context` menjelaskan untuk apa ikon dipakai (mis. "tipe agenda di Planner").
 */
export const buildIconPrompt = (subject: string, context: string) =>
  [
    `Pilih ikon yang paling cocok untuk ${context}: "${subject.trim()}".`,
    "Pertimbangkan makna kata (termasuk sinonim dan bahasa Indonesia/Inggris).",
    "Daftar ikon yang tersedia (format: key = label | kata kunci):",
    ...APP_ICONS.map((icon) => `${icon.key} = ${icon.label} | ${icon.keywords}`),
    "",
    `Jawab HANYA dengan array JSON berisi 1–${MAX_ICON_SUGGESTIONS} key dari daftar di atas, urut dari yang paling cocok.`,
    'Contoh jawaban: ["briefcase","users","presentation"]',
  ].join("\n");

/** Ambil key ikon valid (unik, sesuai urutan) dari jawaban AI; toleran terhadap teks/kode tambahan. */
export const parseIconSuggestions = (text: string): string[] => {
  let candidates: unknown[] = [];
  const json = text.match(/\[[\s\S]*?\]/);
  if (json) {
    try {
      const parsed: unknown = JSON.parse(json[0]);
      if (Array.isArray(parsed)) candidates = parsed;
    } catch {
      // jatuh ke pencarian token di bawah
    }
  }
  if (candidates.length === 0) candidates = text.match(/[a-z][a-z0-9-]+/g) ?? [];
  const keys: string[] = [];
  for (const candidate of candidates) {
    const key = typeof candidate === "string" ? resolveIconKey(candidate.trim().toLowerCase()) : null;
    if (key && !keys.includes(key)) keys.push(key);
    if (keys.length >= MAX_ICON_SUGGESTIONS) break;
  }
  return keys;
};

/**
 * Saran ikon dengan AI milik user (lewat backend, `useAi`). Mengembalikan key ikon valid (bisa kosong).
 * Error ditampilkan sebagai toast; fitur cukup memakai hasilnya.
 */
export function useIconSuggestion(context: string) {
  const ai = useAi();
  const [loading, setLoading] = useState(false);

  const suggest = useCallback(
    async (subject: string): Promise<string[]> => {
      if (!subject.trim()) {
        toast.error("Isi nama terlebih dahulu.");
        return [];
      }
      if (!ai.isConfigured) {
        toast.error(AI_NOT_CONFIGURED);
        return [];
      }
      setLoading(true);
      try {
        const keys = parseIconSuggestions(await ai.generate(buildIconPrompt(subject, context)));
        if (keys.length === 0) toast.info("AI tidak menemukan ikon yang cocok. Pilih manual dari daftar.");
        return keys;
      } catch (error) {
        toast.error("Saran ikon AI gagal", { description: errorMessage(error) });
        return [];
      } finally {
        setLoading(false);
      }
    },
    [ai, context],
  );

  return { suggest, loading, isConfigured: ai.isConfigured };
}
