import { Users } from "lucide-react";
import { useState } from "react";
import { SearchInput } from "@/components/common/search-input";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useClassifications, useJraList, usePhysRefs } from "@/data/collections";
import { useSearchParam } from "@/hooks/use-search-param";
import { SharedBadge } from "@/features/sharing/shared-badge";
import type { ArchiveFile } from "../lib/archive";
import { useArchiveFiles } from "../use-file-control";
import { ArchiveCard } from "./archive-card";

/** Tab kartu yang sesuai status arsip (menentukan informasi yang ditampilkan kartu). */
const cardTab = (file: ArchiveFile) =>
  file.dynamicStatus === "destroyed" || file.dynamicStatus === "static"
    ? file.dynamicStatus
    : file.archivalStatus || "pending";

const noop = () => undefined;

/**
 * Arsip milik pengguna lain yang dibagikan kepada Anda (baca saja di File Control — pengelolaan seperti penataan,
 * peminjaman, dan penyusutan tetap dilakukan pemiliknya). Klik untuk melihat detail & komentar.
 */
export function SharedArchivesTab() {
  const { files } = useArchiveFiles({ includeShared: true });
  const { items: classifications } = useClassifications({ includeShared: true });
  const { items: jraList } = useJraList({ includeShared: true });
  const { items: physRefs } = usePhysRefs({ includeShared: true });
  const [, setDetailId] = useSearchParam("archive");
  const [search, setSearch] = useState("");

  const shared = files
    .filter((f) => !!f.share)
    .filter((f) => {
      const q = search.trim().toLowerCase();
      return !q || [f.title, f.archiveRegId, f.number].some((v) => (v ?? "").toLowerCase().includes(q));
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Arsip milik pengguna lain yang dibagikan kepada Anda. Pengelolaan arsip tetap dilakukan pemiliknya.
        </p>
        <SearchInput value={search} onChange={setSearch} placeholder="Cari judul / nomor arsip..." />
      </div>
      {shared.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-module-soft text-module">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Belum ada arsip yang dibagikan kepada Anda.</EmptyTitle>
            <EmptyDescription>Arsip yang dibagikan muncul di sini beserta nama pemiliknya.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {shared.map((file) => (
            <div key={file.id} className="flex flex-col gap-1.5">
              <SharedBadge item={file} />
              <ArchiveCard
                file={file}
                tab={cardTab(file)}
                classifications={classifications}
                jraList={jraList}
                physRefs={physRefs}
                canEdit={false}
                bulkActive={false}
                selected={false}
                onToggle={noop}
                onDetail={() => setDetailId(file.id)}
                onEdit={noop}
                onDispose={noop}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
