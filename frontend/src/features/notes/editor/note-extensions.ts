import type { AnyExtension } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { StarterKit } from "@tiptap/starter-kit";
import { InkBlock } from "./ink-block";
import { UploadImage } from "./upload-image";

/** Extension editor Catatan Bebas (dipakai editor & konversi Markdown → dokumen agar skemanya sama). */
export const noteExtensions = (): AnyExtension[] => [
  StarterKit.configure({
    link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
  }),
  Highlight,
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({ table: { resizable: false } }),
  InkBlock,
  UploadImage,
];
