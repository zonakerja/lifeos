/**
 * Warna catatan bebas. ID warna disimpan di data, tampilannya
 * dipetakan ke token desain agar konsisten di mode terang & gelap.
 */
export const NOTE_COLORS = [
  { id: "bg-yellow-50", label: "Kuning", card: "bg-mod-notes/12 hover:border-mod-notes/40", swatch: "bg-mod-notes" },
  { id: "bg-blue-50", label: "Biru", card: "bg-mod-planner/12 hover:border-mod-planner/40", swatch: "bg-mod-planner" },
  {
    id: "bg-green-50",
    label: "Hijau",
    card: "bg-mod-productivity/12 hover:border-mod-productivity/40",
    swatch: "bg-mod-productivity",
  },
  { id: "bg-pink-50", label: "Merah Muda", card: "bg-mod-files/12 hover:border-mod-files/40", swatch: "bg-mod-files" },
  {
    id: "bg-purple-50",
    label: "Ungu",
    card: "bg-mod-overview/12 hover:border-mod-overview/40",
    swatch: "bg-mod-overview",
  },
] as const;

export const noteColor = (id?: string) => NOTE_COLORS.find((c) => c.id === id) ?? NOTE_COLORS[0];
