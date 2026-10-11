import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { ImageOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssetUrl } from "@/data/use-asset-url";
import { cn } from "@/lib/utils";

function UploadImageView({ node, selected }: ReactNodeViewProps) {
  const uploadId = node.attrs.uploadId as string | null;
  const url = useAssetUrl(uploadId);

  return (
    <NodeViewWrapper className="my-3">
      {!uploadId ? (
        <div className="flex h-24 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
          <ImageOff className="size-4" /> Gambar tidak tersedia
        </div>
      ) : url ? (
        <img
          src={url}
          alt={(node.attrs.alt as string) || ""}
          className={cn("mx-auto max-h-[70svh] max-w-full rounded-xl", selected && "ring-2 ring-ring ring-offset-2")}
          draggable={false}
        />
      ) : (
        <Skeleton className="h-48 w-full rounded-xl" />
      )}
    </NodeViewWrapper>
  );
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    uploadImage: {
      /** Sisipkan gambar yang sudah diunggah ke object storage. */
      insertUploadedImage: (attrs: { uploadId: string; alt?: string }) => ReturnType;
    };
  }
}

/**
 * Gambar dari object storage. Hanya `uploadId` yang disimpan (bukan URL): link unduhan bertanda tangan berlaku
 * sementara sehingga dibuat ulang setiap kali ditampilkan.
 */
export const UploadImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      uploadId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-upload-id"),
        renderHTML: (attrs) => ({ "data-upload-id": attrs.uploadId }),
      },
      alt: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "img[data-upload-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertUploadedImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(UploadImageView);
  },
});
