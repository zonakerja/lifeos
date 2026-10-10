// Smoke test API end-to-end terhadap server yang sedang berjalan.
// Pemakaian: npm run test:smoke
//   API_URL              default http://localhost:4000/api/v1
//   SMOKE_ADMIN_EMAIL    akun super_admin (default admin@lifeos.com — seed development)
//   SMOKE_ADMIN_PASSWORD (default 123)
//
// Tidak mengubah data asli: semua uji tulis memakai user sementara (member & viewer)
// yang dibuat di awal dan dihapus (cascade) di akhir.
const B = process.env.API_URL ?? "http://localhost:4000/api/v1";
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? "admin@lifeos.com";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? "123";
let failed = 0;
const j = async (method, path, body, token, cookie) => {
  const isForm = body instanceof FormData;
  const r = await fetch(B + path, {
    method,
    headers: {
      ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: `lifeos_rt=${cookie}` } : {}),
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const setCookie = r.headers.getSetCookie().find((c) => c.startsWith("lifeos_rt=")) ?? "";
  const rt = decodeURIComponent(setCookie.split(";")[0].slice("lifeos_rt=".length));
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { s: r.status, d: data, rt, setCookie };
};
const ok = (label, cond, extra = "") => {
  if (!cond) failed++;
  console.log(cond ? "PASS" : "FAIL", label, cond ? "" : JSON.stringify(extra).slice(0, 400));
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- auth (admin)
let r = await j("POST", "/auth/login", {
  email: ADMIN_EMAIL,
  password: "salah-total",
});
ok("login wrong pw 401", r.s === 401, r);
r = await j("POST", "/auth/login", {
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
});
ok("login 200", r.s === 200 && r.d.accessToken, r);
const admin = r.d.accessToken;
ok("no passwordHash", !("passwordHash" in r.d.user));

// User sementara untuk semua uji tulis
const email = `smoke-${Date.now()}@lifeos.test`;
r = await j("POST", "/users", { name: "Smoke Test", email, password: "rahasia", role: "member" }, admin);
ok("create temp user", r.s === 201 && r.d.id, r);
const tempUserId = r.d.id;
const viewerEmail = `smoke-viewer-${Date.now()}@lifeos.test`;
r = await j("POST", "/users", { name: "Smoke Viewer", email: viewerEmail, password: "rahasia", role: "viewer" }, admin);
ok("create temp viewer", r.s === 201 && r.d.id, r);
const tempViewerId = r.d.id;
r = await j("POST", "/auth/login", { email, password: "rahasia" });
let at = r.d.accessToken;
const rt = r.rt;
ok(
  "refresh token only in httpOnly cookie",
  !("refreshToken" in r.d) &&
    /HttpOnly/i.test(r.setCookie) &&
    /SameSite=Strict/i.test(r.setCookie) &&
    /Path=\/api\/v1\/auth/i.test(r.setCookie),
  r.setCookie,
);

try {
  r = await j("GET", "/auth/me", null, at);
  ok("me", r.s === 200 && r.d.email === email, r);
  r = await j("PATCH", "/auth/me", { phone: "0811", apiKey: "k-test" }, at);
  ok("patch me", r.s === 200 && r.d.apiKey === "k-test", r);

  // ------------------------------------------------------------ settings (tulis nilai yang sama)
  r = await j("GET", "/settings/app");
  ok("settings public", r.s === 200 && r.d.name, r);
  r = await j("PATCH", "/settings/app", { name: r.d.name }, admin);
  ok("patch settings", r.s === 200, r);
  r = await j("PATCH", "/settings/app", { id: "x" }, admin);
  ok("settings reject unknown 400", r.s === 400, r);

  // ------------------------------------------------------------ records (tabel terstruktur)
  r = await j("PUT", "/records/para_project/proj-1", { payload: { title: "Proyek A", deadline: "2026-12-01" } }, at);
  ok("upsert create", r.s === 200 && r.d.clientId === "proj-1" && r.d.payload.id === "proj-1", r);
  r = await j("PUT", "/records/para_project/proj-1", { payload: { title: "Proyek A2" } }, at);
  ok("upsert update", r.d.title === "Proyek A2" && !("deadline" in r.d.payload), r);
  r = await j("GET", "/records/para_project", null, at);
  ok("list 1", r.s === 200 && r.d.length === 1, r);
  r = await j("DELETE", "/records/para_project/proj-1", null, at);
  ok("delete", r.s === 200, r);
  r = await j("GET", "/records/para_project", null, at);
  ok("list 0", r.d.length === 0, r);
  r = await j("PUT", "/records/para_project/proj-1", { payload: { title: "Hidup lagi" } }, at);
  ok("undelete via upsert", r.s === 200, r);

  // Round-trip semua jenis kolom + nilai tidak valid tetap utuh (lossless)
  const task = {
    id: "task-1",
    projectId: "proj-1",
    title: "Uji tipe",
    dueDate: "2026-10-08",
    weight: 2.5,
    completed: true,
    completedAt: "2026-10-08T15:00:02.750Z",
    resources: [{ id: "r1", type: "link" }],
    priority: null,
    custom: { nested: [1, null, "x"] },
  };
  r = await j("PUT", "/records/para_task/task-1", { payload: task }, at);
  const { userId: _ignored, ...back } = r.d.payload;
  ok(
    "typed round-trip",
    r.s === 200 &&
      same(Object.keys(back).sort(), Object.keys(task).sort()) &&
      same(back.custom, task.custom) &&
      back.completedAt === task.completedAt &&
      back.dueDate === task.dueDate &&
      back.priority === null,
    r,
  );
  r = await j(
    "PUT",
    "/records/todo/numeric-5",
    {
      payload: { id: 5, title: "x", date: "Fri Oct 08 2026", completed: "yes" },
    },
    at,
  );
  ok(
    "invalid values preserved",
    r.d.payload.id === 5 && r.d.payload.date === "Fri Oct 08 2026" && r.d.payload.completed === "yes",
    r,
  );
  r = await j("PUT", "/records/todo/t-ok", { payload: { title: "ok", date: "Thu Oct 08 2026", completed: false } }, at);
  ok("dateKey date column", r.d.date === "2026-10-08T00:00:00.000Z" && r.d.payload.date === "Thu Oct 08 2026", r);

  r = await j("GET", "/records/nope", null, at);
  ok("unknown type 404", r.s === 404, r);

  // ------------------------------------------------------------ audit kearsipan
  const borrowing = {
    title: "x",
    borrowerName: "Budi",
    date: "2026-10-08",
    returnDate: "2026-10-20",
    items: [],
    status: "active",
  };
  await j("PUT", "/records/archive_borrowing/b-1", { payload: borrowing }, at);
  await j("PUT", "/records/archive_borrowing/b-1", { payload: { ...borrowing, status: "returned" } }, at);
  await j("PUT", "/records/archive_borrowing/b-1", { payload: { ...borrowing, status: "returned" } }, at); // tanpa perubahan
  await j("DELETE", "/records/archive_borrowing/b-1", null, at);
  r = await j("GET", "/archive-audit?entityType=archive_borrowing&entityId=b-1", null, at);
  const actions = Array.isArray(r.d) ? r.d.map((log) => log.action).reverse() : [];
  ok("audit created/updated/deleted", same(actions, ["created", "updated", "deleted"]), r);
  ok("audit diff", r.d?.[1]?.changes?.status?.from === "active" && r.d[1].changes.status.to === "returned", r.d?.[1]);
  await j("PUT", "/records/para_resource/plain", { payload: { title: "bukan arsip", type: "link" } }, at);
  r = await j("GET", "/archive-audit?entityType=para_resource", null, at);
  ok("non-archival resource not audited", Array.isArray(r.d) && r.d.length === 0, r);

  // ------------------------------------------------------------ uploads
  const fd = new FormData();
  fd.append("file", new Blob(["Halo arsip LifeOS"], { type: "text/plain" }), "catatan é.txt");
  fd.append("context", "resource");
  r = await j("POST", "/uploads", fd, at);
  ok("upload", r.s === 201 && r.d.id && r.d.originalName === "catatan é.txt", r);
  const assetId = r.d.id;
  await new Promise((res) => setTimeout(res, 2500));
  r = await j("GET", `/uploads/${assetId}/metadata`, null, at);
  ok(
    "extraction completed",
    r.d.extraction?.status === "completed" && r.d.extraction.extractedText.includes("Halo"),
    r,
  );
  r = await j("GET", `/uploads/${assetId}`, null, at);
  ok("stream w/ bearer", r.s === 200 && r.d === "Halo arsip LifeOS", r);
  r = await j("POST", `/uploads/${assetId}/link`, null, at);
  ok("link", r.s === 201, r);
  const link = r.d.url;
  const dlToken = decodeURIComponent(link.split("token=")[1]);
  r = await j("GET", link);
  ok("download via link", r.s === 200 && r.d === "Halo arsip LifeOS", r);
  r = await j("GET", "/auth/me", null, dlToken);
  ok("download token not usable as access 401", r.s === 401, r);
  r = await j("GET", `/uploads/${assetId}/download?token=bad`);
  ok("bad link 401", r.s === 401, r);
  r = await j("DELETE", `/uploads/${assetId}`, null, at);
  ok("delete upload", r.s === 200, r);

  // ------------------------------------------------------------ refresh token (cookie httpOnly)
  r = await j("POST", "/auth/refresh");
  ok("refresh without cookie 401", r.s === 401, r);
  r = await j("POST", "/auth/refresh", null, null, rt);
  ok("refresh rotates cookie", r.s === 200 && r.d.accessToken && r.rt && r.rt !== rt, r);
  const rt2 = r.rt;
  r = await j("POST", "/auth/refresh", null, null, rt);
  ok("parallel refresh within grace window", r.s === 200, r);
  r = await j("POST", "/auth/logout", null, null, rt2);
  ok("logout clears cookie", r.s === 200 && /lifeos_rt=;/.test(r.setCookie), r.setCookie);
  r = await j("POST", "/auth/refresh", null, null, rt2);
  ok("refresh after logout 401", r.s === 401, r);

  // Ganti password: sesi lain dicabut, sesi saat ini tetap
  const sessionA = await j("POST", "/auth/login", { email, password: "rahasia" });
  const sessionB = await j("POST", "/auth/login", { email, password: "rahasia" });
  r = await j(
    "POST",
    "/auth/change-password",
    { currentPassword: "rahasia", newPassword: "rahasia2" },
    sessionA.d.accessToken,
    sessionA.rt,
  );
  ok("change password", r.s === 200, r);
  r = await j("POST", "/auth/refresh", null, null, sessionB.rt);
  ok("other sessions revoked after password change", r.s === 401, r);
  r = await j("POST", "/auth/refresh", null, null, sessionA.rt);
  ok("current session kept after password change", r.s === 200, r);

  // ------------------------------------------------------------ viewer (read-only)
  r = await j("POST", "/auth/login", { email: viewerEmail, password: "rahasia" });
  const vt = r.d.accessToken;
  r = await j("PUT", "/records/todo/x", { payload: {} }, vt);
  ok("viewer write 403", r.s === 403, r);
  r = await j("GET", "/users", null, vt);
  ok("viewer users 403", r.s === 403, r);
  r = await j("POST", "/auth/change-password", { currentPassword: "salah", newPassword: "1234" }, vt);
  ok("change pw wrong 400", r.s === 400, r);
  r = await j("POST", "/auth/logout", null, null, "x".repeat(30));
  ok("logout idempotent", r.s === 200, r);
  const docs = await fetch(B.replace("/api/v1", "/api/docs-json"));
  if (docs.status === 404) console.log("SKIP swagger json (dinonaktifkan di production)");
  else ok("swagger json", docs.status === 200);
} finally {
  r = await j("DELETE", `/users/${tempUserId}`, null, admin);
  ok("delete temp user (cascade)", r.s === 200, r);
  r = await j("DELETE", `/users/${tempViewerId}`, null, admin);
  ok("delete temp viewer", r.s === 200, r);
}

console.log(failed ? `\n${failed} test GAGAL` : "\nSemua test lulus");
process.exit(failed ? 1 : 0);
