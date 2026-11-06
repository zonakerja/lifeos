import type { KnowledgeGraphColor, KnowledgeNoteStatus } from "@/types/api";
import { matchesNodeQuery, parseNodeQuery, type QueryableNode } from "./knowledge-logic";

/** Warna grup graf → token CSS (`--graph-*` di index.css, terang & gelap). */
export const GRAPH_COLOR_VARS: Record<KnowledgeGraphColor, string> = {
  blue: "--graph-blue",
  green: "--graph-green",
  orange: "--graph-orange",
  red: "--graph-red",
  violet: "--graph-violet",
  teal: "--graph-teal",
  pink: "--graph-pink",
  yellow: "--graph-yellow",
};

export const GRAPH_COLOR_LABELS: Record<KnowledgeGraphColor, string> = {
  blue: "Biru",
  green: "Hijau",
  orange: "Oranye",
  red: "Merah",
  violet: "Ungu",
  teal: "Toska",
  pink: "Merah muda",
  yellow: "Kuning",
};

/** Warna bawaan menurut status catatan (berlaku hijau, draf oranye, dicabut merah, templat ungu). */
export function statusColorVar(status: KnowledgeNoteStatus | null): string | undefined {
  switch (status) {
    case "berlaku":
      return GRAPH_COLOR_VARS.green;
    case "draf":
      return GRAPH_COLOR_VARS.orange;
    case "dicabut":
      return GRAPH_COLOR_VARS.red;
    case "templat":
      return GRAPH_COLOR_VARS.violet;
    default:
      return undefined;
  }
}

/** Warna node: grup pertama yang cocok (urutan pengguna), lalu warna status bila diaktifkan. */
export function nodeColorVar(
  node: QueryableNode & { status: KnowledgeNoteStatus | null },
  groups: { query: string; color: KnowledgeGraphColor }[],
  byStatus: boolean,
) {
  for (const group of groups)
    if (matchesNodeQuery(node, parseNodeQuery(group.query))) return GRAPH_COLOR_VARS[group.color];
  return byStatus ? statusColorVar(node.status) : undefined;
}
