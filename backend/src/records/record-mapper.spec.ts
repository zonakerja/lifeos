import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { type DomainRow, payloadToRow, rowToPayload, toApiRecord } from "./record-mapper";
import { RECORD_TABLES, type TableSpec } from "./record-schema";

/** Simulasikan simpan → baca: data kolom diubah seperti yang dikembalikan Prisma. */
function roundTrip(type: keyof typeof RECORD_TABLES, payload: Record<string, unknown>, clientId: string) {
  const spec: TableSpec = RECORD_TABLES[type];
  const data = payloadToRow(spec, payload, clientId);
  const columns = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value === Prisma.DbNull ? null : value]),
  );
  const row = {
    ...columns,
    id: "row-1",
    userId: "user-1",
    clientId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as DomainRow;
  return { spec, data, row, payload: rowToPayload(spec, row) };
}

describe("record mapper", () => {
  it("menyimpan nilai valid ke kolom bertipe dan membaca kembali identik", () => {
    const task = {
      id: "task-1",
      projectId: "p1",
      title: "Uji",
      dueDate: "2026-10-08",
      weight: 2.5,
      completed: true,
      completedAt: "2026-10-08T15:00:02.750Z",
      resources: [{ id: "r1" }],
    };
    const { data, payload } = roundTrip("para_task", task, "task-1");
    expect(data.dueDate).toEqual(new Date(Date.UTC(2026, 9, 8)));
    expect(data.completedAt).toEqual(new Date("2026-10-08T15:00:02.750Z"));
    expect(data.extra).toEqual({});
    expect(payload).toEqual({ ...task, userId: "user-1" });
  });

  it("memetakan format Date.toDateString() ke kolom DATE", () => {
    const { data, payload } = roundTrip("todo", { id: "t", date: "Thu Oct 08 2026", title: "x" }, "t");
    expect(data.date).toEqual(new Date(Date.UTC(2026, 9, 8)));
    expect(payload.date).toBe("Thu Oct 08 2026");
  });

  it("menyimpan nilai tidak valid, null eksplisit, dan key asing ke extra (lossless)", () => {
    const todo = {
      id: 5,
      title: "x",
      date: "Fri Oct 08 2026", // hari tidak cocok dengan tanggal
      completed: "yes",
      priority: null,
      custom: { nested: [1, null, "a"] },
    };
    const { data, payload } = roundTrip("todo", todo, "5");
    expect(data.date).toBeNull();
    expect(data.completed).toBeNull();
    expect(data.extra).toEqual({
      id: 5,
      date: "Fri Oct 08 2026",
      completed: "yes",
      priority: null,
      custom: todo.custom,
    });
    expect(payload).toEqual({ ...todo, userId: "user-1" });
  });

  it("menolak tanggal kalender yang tidak ada dan bilangan bulat di luar int32", () => {
    const { data } = roundTrip("schedule", { id: "s", startDate: "2026-02-30" }, "s");
    expect(data.startDate).toBeNull();
    expect(data.extra).toEqual({ startDate: "2026-02-30" });
    const jra = roundTrip("archive_jra", { id: "j", retensiAktif: 1.5, retensiInaktif: 3 }, "j");
    expect(jra.data.retensiAktif).toBeNull();
    expect(jra.data.retensiInaktif).toBe(3);
  });

  it("memakai nama field Prisma khusus untuk key yang bentrok (user → executedBy)", () => {
    const { data, payload } = roundTrip("archive_disposition", { id: "d", user: "Admin" }, "d");
    expect(data.executedBy).toBe("Admin");
    expect(payload.user).toBe("Admin");
  });

  it("menghasilkan title & date respons API dari spesifikasi", () => {
    const { spec, row } = roundTrip("para_project", { id: "p", title: "Proyek", startDate: "2026-01-02" }, "p");
    const record = toApiRecord("para_project", spec, row);
    expect(record.title).toBe("Proyek");
    expect(record.date).toBe("2026-01-02T00:00:00.000Z");
    expect(record.payload.id).toBe("p");
  });
});
