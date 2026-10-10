import { ArrowRightLeft, FileX, Handshake, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParam } from "@/hooks/use-search-param";
import { BorrowPanel } from "./borrow-panel";
import { DispositionHistoryPanel } from "./disposition-history-panel";
import { GlobalSearchPanel } from "./global-search-panel";
import { MovePanel } from "./move-panel";

const SUB_TABS = ["search", "move", "borrow", "disposition"] as const;

/** Tab Transaksi: pencarian global, pemindahan, peminjaman, histori penyusutan (sub-tab di `?sub=`). */
export function TransactionsTab() {
  const [sub, setSub] = useSearchParam("sub");
  const value = SUB_TABS.includes(sub as (typeof SUB_TABS)[number]) ? (sub as string) : "search";
  return (
    <Tabs value={value} onValueChange={(v) => setSub(v === "search" ? null : v)} className="gap-5">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="search">
          <Search /> Pencarian Global
        </TabsTrigger>
        <TabsTrigger value="move">
          <ArrowRightLeft /> Pemindahan Arsip
        </TabsTrigger>
        <TabsTrigger value="borrow">
          <Handshake /> Sirkulasi / Peminjaman
        </TabsTrigger>
        <TabsTrigger value="disposition">
          <FileX /> Histori Penyusutan
        </TabsTrigger>
      </TabsList>
      <Card className="p-4 md:p-6">
        <TabsContent value="search">
          <GlobalSearchPanel />
        </TabsContent>
        <TabsContent value="move">
          <MovePanel />
        </TabsContent>
        <TabsContent value="borrow">
          <BorrowPanel />
        </TabsContent>
        <TabsContent value="disposition">
          <DispositionHistoryPanel />
        </TabsContent>
      </Card>
    </Tabs>
  );
}
