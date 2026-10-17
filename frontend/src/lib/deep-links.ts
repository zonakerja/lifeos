/**
 * Deep link antar modul. Dipakai oleh notifikasi, overview, global search, dan
 * link `app:<type>:<id>` yang dihasilkan chatbot AI.
 * Halaman tujuan membaca query param (?edit=, ?project=, ...) untuk membuka item.
 */
export const links = {
  /** Tampilan lihat agenda (link meeting, dasar pelaksanaan, hasil agenda) */
  schedule: (id: string) => `/planner/schedule?agenda=${encodeURIComponent(id)}`,
  /** Seri agenda berulang → tampilan lihat pertemuan terdekat */
  series: (seriesId: string) => `/planner/schedule?series=${encodeURIComponent(seriesId)}`,
  scheduleEdit: (id: string) => `/planner/schedule?edit=${encodeURIComponent(id)}`,
  /** Notes AI baru yang langsung terhubung ke agenda */
  newAiNoteForSchedule: (id: string) => `/notes/ai?note=new&schedule=${encodeURIComponent(id)}`,
  routineEdit: (id: string) => `/planner/routines?edit=${encodeURIComponent(id)}`,
  todo: (id: string) => `/planner/daily?todo=${encodeURIComponent(id)}`,
  project: (id: string) => `/productivity/projects?project=${encodeURIComponent(id)}`,
  task: (id: string) => `/productivity/projects?task=${encodeURIComponent(id)}`,
  areas: () => "/productivity/areas",
  area: (id: string) => `/productivity/areas?area=${encodeURIComponent(id)}`,
  resource: (id: string) => `/productivity/resources?resource=${encodeURIComponent(id)}`,
  /** Detail arsip di File Control (tab sesuai status kearsipan). */
  archive: (id: string, tab: "pending" | "physical" | "digital" = "pending") =>
    `/file-control/${tab}?archive=${encodeURIComponent(id)}`,
  notes: (tab: "free" | "ai" | "lists" = "free") => `/notes/${tab}`,
  /** Buka langsung satu catatan (tab Catatan / Notes AI). */
  /** My Notebook (tab Notes Space) — tanpa id = daftar notebook */
  notebook: (id?: string) => (id ? `/notes/notebook?notebook=${encodeURIComponent(id)}` : "/notes/notebook"),
  note: (tab: "free" | "ai", id: string | number) => `/notes/${tab}?note=${encodeURIComponent(String(id))}`,
  /** Sorot satu list di tab List Bebas. */
  list: (id: string | number) => `/notes/lists?list=${encodeURIComponent(String(id))}`,
};

/** `app:<type>:<id>` → path aplikasi, atau null bila tidak dikenal. */
export const resolveAppLink = (href: string): string | null => {
  const [, type, ...rest] = href.split(":");
  const id = rest.join(":");
  if (!type || !id) return null;
  switch (type) {
    case "project":
      return links.project(id);
    case "task":
    case "action":
      return links.task(id);
    case "area":
    case "activity":
      return links.areas();
    case "schedule":
      return links.schedule(id);
    case "todo":
      return links.todo(id);
    case "routine":
      return links.routineEdit(id);
    case "resource":
      return links.resource(id);
    case "ainote":
      return links.note("ai", id);
    case "freenote":
      return links.note("free", id);
    default:
      return null;
  }
};
