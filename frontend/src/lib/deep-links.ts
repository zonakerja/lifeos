/**
 * Deep link antar modul. Dipakai oleh notifikasi, overview, global search, dan
 * link `app:<type>:<id>` yang dihasilkan chatbot AI.
 * Halaman tujuan membaca query param (?edit=, ?project=, ...) untuk membuka item.
 */
export const links = {
  scheduleEdit: (id: string) => `/planner/schedule?edit=${encodeURIComponent(id)}`,
  routineEdit: (id: string) => `/planner/routines?edit=${encodeURIComponent(id)}`,
  todo: (id: string) => `/planner/daily?todo=${encodeURIComponent(id)}`,
  project: (id: string) => `/productivity/projects?project=${encodeURIComponent(id)}`,
  task: (id: string) => `/productivity/projects?task=${encodeURIComponent(id)}`,
  areas: () => "/productivity/areas",
  resource: (id: string) => `/productivity/resources?resource=${encodeURIComponent(id)}`,
  notes: (tab: "free" | "ai" | "lists" = "free") => `/notes/${tab}`,
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
      return links.scheduleEdit(id);
    case "todo":
      return links.todo(id);
    case "routine":
      return links.routineEdit(id);
    case "resource":
      return links.resource(id);
    case "ainote":
      return links.notes("ai");
    case "freenote":
      return links.notes("free");
    default:
      return null;
  }
};
