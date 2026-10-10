import { BookMarked, Hourglass, MapPin } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParam } from "@/hooks/use-search-param";
import { ClassificationManager } from "./classification-manager";
import { JraManager } from "./jra-manager";
import { PhysicalReferenceManager } from "./physical-reference-manager";

const SUB_TABS = ["klasifikasi", "jra", "lokasi"] as const;

/** Tab Referensi: Klasifikasi, Jadwal Retensi (JRA), Lokasi Fisik. Sub-tab di `?ref=`. */
export function ReferencesTab() {
  const [ref, setRef] = useSearchParam("ref");
  const value = SUB_TABS.includes(ref as (typeof SUB_TABS)[number]) ? (ref as string) : "klasifikasi";
  return (
    <Tabs value={value} onValueChange={(v) => setRef(v === "klasifikasi" ? null : v)} className="gap-5">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="klasifikasi">
          <BookMarked /> Klasifikasi
        </TabsTrigger>
        <TabsTrigger value="jra">
          <Hourglass /> Jadwal Retensi
        </TabsTrigger>
        <TabsTrigger value="lokasi">
          <MapPin /> Lokasi Fisik
        </TabsTrigger>
      </TabsList>
      <TabsContent value="klasifikasi">
        <ClassificationManager />
      </TabsContent>
      <TabsContent value="jra">
        <JraManager />
      </TabsContent>
      <TabsContent value="lokasi">
        <PhysicalReferenceManager />
      </TabsContent>
    </Tabs>
  );
}
