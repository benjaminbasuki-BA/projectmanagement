// Re-seeds the in-memory PGlite dev API after a restart: dev user, org,
// workspace, boards (default group + status column), and sample items.
// Fictional OIT (BYU-Hawaii IT department) demo data — enough status/owner
// variety to exercise the collapsed-group distribution bar (doc 11 §C.3).
const API = "http://localhost:3001";
let cookie = "";

async function req(path, method = "GET", body) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.getSetCookie?.() ?? [];
  if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const DEV_USER = {
  email: "dev@trellis.local",
  password: "dev-local-password",
  name: "Dev User",
};

// Must stay in sync with apps/web/src/features/boards/defaults.ts
// (design.md §3.3).
const STATUS_SETTINGS = {
  labels: [
    { id: "lbl_not_started", text: "Not started", color: "#A39A8D", is_done: false },
    { id: "lbl_working", text: "Working on it", color: "#E08A1E", is_done: false },
    { id: "lbl_stuck", text: "Stuck", color: "#C4432F", is_done: false },
    { id: "lbl_done", text: "Done", color: "#4E8A5C", is_done: true },
  ],
};

const PRIORITY_SETTINGS = {
  options: [
    { id: "opt_low", text: "Low" },
    { id: "opt_medium", text: "Medium" },
    { id: "opt_high", text: "High" },
    { id: "opt_critical", text: "Critical" },
  ],
};

// Auth (login, or first-run signup)
try {
  await req("/v1/auth/login", "POST", { email: DEV_USER.email, password: DEV_USER.password });
  console.log("logged in");
} catch {
  await req("/v1/auth/signup", "POST", DEV_USER);
  console.log("signed up");
}

// Org
const me = await req("/v1/auth/me");
if (!me.activeOrgId) {
  await req("/v1/organizations", "POST", { name: "BYU-Hawaii", slug: "byu-hawaii" });
  console.log("created org BYU-Hawaii");
}

// Workspace
let { workspaces } = await req("/v1/workspaces");
let ws = workspaces.find((w) => w.name === "OIT");
if (!ws) {
  ws = (await req("/v1/workspaces", "POST", { name: "OIT" })).workspace;
  console.log("created workspace OIT");
}

async function makeBoard(name, extraColumns = [], items = []) {
  const { boards } = await req(`/v1/workspaces/${ws.id}/boards`);
  if (boards.some((b) => b.name === name)) {
    console.log(`board ${name} already exists, skipping`);
    return;
  }
  const { board } = await req(`/v1/workspaces/${ws.id}/boards`, "POST", { name });
  const { group } = await req(`/v1/boards/${board.id}/groups`, "POST", { title: "Group 1" });
  const { column: statusCol } = await req(`/v1/boards/${board.id}/columns`, "POST", {
    title: "Status",
    type: "status",
    settings: STATUS_SETTINGS,
  });
  const colIds = { status: statusCol.id };
  for (const c of extraColumns) {
    const { column } = await req(`/v1/boards/${board.id}/columns`, "POST", {
      title: c.title,
      type: c.type,
      settings: c.settings ?? {},
    });
    colIds[c.key] = column.id;
  }
  for (const it of items) {
    const { item } = await req(`/v1/boards/${board.id}/items`, "POST", {
      name: it.name,
      groupId: group.id,
    });
    const values = {};
    for (const [key, value] of Object.entries(it.values ?? {})) {
      values[colIds[key]] = value;
    }
    if (Object.keys(values).length) {
      await req(`/v1/items/${item.id}/column-values`, "PATCH", values);
    }
  }
  console.log(`created board ${name} (${items.length} items)`);
}

function status(id) {
  return { label_id: id };
}
function text(t) {
  return { text: t };
}
function date(d) {
  return { date: d, time: null };
}
function number(n) {
  return { number: n };
}
function priority(id) {
  return { option_ids: [id] };
}

await makeBoard(
  "Laptop",
  [
    { key: "owner", title: "Owner", type: "text" },
    { key: "due", title: "Due date", type: "date" },
    { key: "qty", title: "Qty", type: "number" },
  ],
  [
    {
      name: "Dell XPS 15 — Lab 2 refresh",
      values: { status: status("lbl_working"), owner: text("K. Nakamura"), due: date("2026-07-24"), qty: number(12) },
    },
    {
      name: "MacBook Air M3 — front desk",
      values: { status: status("lbl_done"), owner: text("T. Fonoti"), due: date("2026-07-10"), qty: number(2) },
    },
    {
      name: "ThinkPad T14 warranty claims",
      values: { status: status("lbl_stuck"), owner: text("M. Reyes"), due: date("2026-07-31"), qty: number(5) },
    },
    {
      name: "Loaner pool reimage",
      values: { status: status("lbl_not_started"), due: date("2026-08-07"), qty: number(18) },
    },
    {
      name: "Surface Laptop 5 — Registrar office",
      values: { status: status("lbl_stuck"), owner: text("L. Pulotu"), due: date("2026-07-22"), qty: number(4) },
    },
    {
      name: "HP EliteBook restock — IT storeroom",
      values: { status: status("lbl_not_started"), owner: text("K. Nakamura"), due: date("2026-08-14"), qty: number(20) },
    },
    {
      name: "Chromebook cart — Library instruction room",
      values: { status: status("lbl_done"), owner: text("T. Fonoti"), due: date("2026-07-05"), qty: number(30) },
    },
    {
      name: "MacBook Pro 14 — Media Services",
      values: { status: status("lbl_working"), owner: text("M. Reyes"), due: date("2026-07-26"), qty: number(3) },
    },
    {
      name: "Lenovo ThinkPad X1 — President's office",
      values: { status: status("lbl_done"), owner: text("L. Pulotu"), due: date("2026-07-01"), qty: number(1) },
    },
    {
      name: "Battery replacement batch — Housing laptops",
      values: { status: status("lbl_stuck"), owner: text("K. Nakamura"), due: date("2026-07-29"), qty: number(9) },
    },
  ],
);

await makeBoard(
  "Projector",
  [{ key: "room", title: "Room", type: "text" }],
  [
    { name: "Auditorium lamp replacement", values: { status: status("lbl_working"), room: text("Cannon Activities Center") } },
    { name: "Room 114 ceiling mount", values: { status: status("lbl_not_started"), room: text("McKay Building") } },
    { name: "Business building Rm 201 bulb", values: { status: status("lbl_done"), room: text("Cannon Business Bldg") } },
    { name: "Science building projector calibration", values: { status: status("lbl_stuck"), room: text("Hawaii Science Bldg") } },
    { name: "Chapel AV projector swap", values: { status: status("lbl_done"), room: text("David O. McKay Chapel") } },
    { name: "Testing center projector install", values: { status: status("lbl_not_started"), room: text("HGB Testing Center") } },
  ],
);

await makeBoard(
  "Desktop",
  [{ key: "location", title: "Location", type: "text" }],
  [
    { name: "Testing center thin clients", values: { status: status("lbl_done"), location: text("HGB Testing Center") } },
    { name: "Library kiosk upgrades", values: { status: status("lbl_working"), location: text("Joseph F. Smith Library") } },
    { name: "Financial Office desktop refresh", values: { status: status("lbl_not_started"), location: text("Alumni & Visitor Center") } },
    { name: "Admissions front desk iMacs", values: { status: status("lbl_done"), location: text("McKay Building") } },
    { name: "Career Center workstation repair", values: { status: status("lbl_stuck"), location: text("McKay Building") } },
    { name: "Bookstore POS desktop swap", values: { status: status("lbl_working"), location: text("Aloha Center") } },
  ],
);

await makeBoard(
  "Network Equipment",
  [
    { key: "priority", title: "Priority", type: "dropdown", settings: PRIORITY_SETTINGS },
    { key: "location", title: "Location", type: "text" },
    { key: "installed", title: "Installed", type: "date" },
  ],
  [
    { name: "Switch replacement — TVA building", values: { status: status("lbl_working"), priority: priority("opt_high"), location: text("TVA Building"), installed: date("2026-06-02") } },
    { name: "Wireless AP install — Aloha Center", values: { status: status("lbl_done"), priority: priority("opt_medium"), location: text("Aloha Center"), installed: date("2026-05-14") } },
    { name: "Firewall firmware update — Data center", values: { status: status("lbl_stuck"), priority: priority("opt_critical"), location: text("Data Center"), installed: date("2026-07-18") } },
    { name: "Fiber run — Heber J. Grant Building", values: { status: status("lbl_not_started"), priority: priority("opt_medium"), location: text("HGB"), installed: date("2026-08-01") } },
    { name: "VPN concentrator upgrade", values: { status: status("lbl_working"), priority: priority("opt_high"), location: text("Data Center"), installed: date("2026-07-25") } },
    { name: "Campus wifi survey — dorms", values: { status: status("lbl_not_started"), priority: priority("opt_low"), location: text("Hales"), installed: date("2026-08-20") } },
  ],
);

console.log("seed complete");
