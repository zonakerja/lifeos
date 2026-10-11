/**
 * Preferensi "Ringkas dengan AI" saat mengunggah lampiran (per browser). Default **mati**: AI hanya dipanggil bila user
 * mencentangnya, agar tidak ada panggilan penyedia AI (biaya/kuota) tanpa disadari. Ringkasan tetap bisa dibuat nanti
 * lewat ikon robot di tabel lampiran.
 */
const KEY = "lifeos.attachments.aiSummary";

export const readAiSummaryPreference = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export const writeAiSummaryPreference = (enabled: boolean) => {
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    // Storage diblokir: preferensi hanya berlaku untuk form ini
  }
};
