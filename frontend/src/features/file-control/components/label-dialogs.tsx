import { Printer } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useClassifications } from "@/data/collections";
import { useRetained } from "@/hooks/use-retained";
import type { ArchiveResource, PhysicalReference } from "@/types/entities";
import { archiveTitle, classificationCode } from "../lib/archive";
import { printElement } from "../lib/print";
import { ArchiveLabel, ContainerLabel } from "./archive-ui";

/** Pratinjau & cetak label QR arsip. */
export function ArchiveLabelDialog({ file: fileProp, onClose }: { file: ArchiveResource | null; onClose: () => void }) {
  const file = useRetained(fileProp);
  const { items: classifications } = useClassifications();
  const ref = useRef<HTMLDivElement>(null);
  const cls = classifications.find((c) => c.id === file?.classificationId);

  return (
    <Dialog open={!!fileProp} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Preview Label Arsip</DialogTitle>
          <DialogDescription>Tempel label pada fisik arsip untuk scan cepat.</DialogDescription>
        </DialogHeader>
        {file && (
          <ArchiveLabel
            ref={ref}
            regId={file.archiveRegId || file.id}
            code={classificationCode(cls)}
            title={archiveTitle(file)}
            isVital={file.isVital}
          />
        )}
        <Button onClick={() => printElement(ref.current, "Cetak Label Arsip")}>
          <Printer /> Cetak Label
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Pratinjau & cetak label QR wadah fisik. */
export function ContainerLabelDialog({
  container: containerProp,
  onClose,
}: {
  container: PhysicalReference | null;
  onClose: () => void;
}) {
  const container = useRetained(containerProp);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={!!containerProp} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Preview Label Cetak</DialogTitle>
          <DialogDescription>Label lokasi penyimpanan dengan QR Code.</DialogDescription>
        </DialogHeader>
        {container && <ContainerLabel ref={ref} container={container} />}
        <Button onClick={() => printElement(ref.current, "Cetak Label Lokasi")}>
          <Printer /> Cetak Label
        </Button>
      </DialogContent>
    </Dialog>
  );
}
