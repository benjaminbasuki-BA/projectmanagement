/**
 * The 6 MVP starter templates (docs/01-vision-and-scope.md §2.7: "Client
 * Project Delivery, Creative Request Intake, Content Calendar, Simple
 * Sprint, Client Onboarding, Bug/Issue Tracker... every template opens
 * pre-filled with realistic example items and a 60-second explainer
 * note"). Custom template saving is V1 — these are static, code-defined
 * content, not a database table, matching how defaults.ts's status
 * settings already work. A `templates` table only earns its keep once
 * users can create their own (V1), which would need org-scoping, an
 * owner, a save-as-template endpoint — none of which exists yet and
 * building it now would be exactly the kind of opportunistic V1 work
 * CLAUDE.md says not to do.
 *
 * `settings.labels`/`settings.options` ids are scoped to a single
 * template's own column — no cross-template sharing, so there's no risk
 * of collision when two templates both define a "lbl_done".
 */

export interface TemplateColumn {
  title: string;
  type: string;
  settings?: Record<string, unknown>;
}

export interface TemplateGroup {
  title: string;
  color: string;
}

/** `values` keys are indexes into the template's own `columns` array. */
export interface TemplateItem {
  name: string;
  groupIndex: number;
  values?: Record<number, unknown>;
  /** Assign this item's first `person` column to whoever instantiates the template. */
  assignToCreator?: boolean;
}

export interface BoardTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  explainer: string;
  groups: TemplateGroup[];
  columns: TemplateColumn[];
  items: TemplateItem[];
}

const STATUS = {
  title: "Status",
  type: "status",
  settings: {
    labels: [
      { id: "lbl_not_started", text: "Not started", color: "#A39A8D" },
      { id: "lbl_working", text: "Working on it", color: "#E08A1E" },
      { id: "lbl_stuck", text: "Stuck", color: "#C4432F" },
      { id: "lbl_done", text: "Done", color: "#4E8A5C", is_done: true },
    ],
  },
} satisfies TemplateColumn;

function due(date: string): unknown {
  return { date, time: null };
}
function status(id: string): unknown {
  return { label_id: id };
}
function opt(id: string): unknown {
  return { option_ids: [id] };
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: "client-project-delivery",
    name: "Client Project Delivery",
    category: "Agency",
    description:
      "Track deliverables for a single client engagement from kickoff to handoff.",
    explainer:
      "Four stages take a project from discovery through delivery. Add one row per deliverable, assign an owner, and the Status column carries it across the board.",
    groups: [
      { title: "Discovery", color: "#579BFC" },
      { title: "In Progress", color: "#FDAB3D" },
      { title: "Client Review", color: "#A25DDC" },
      { title: "Delivered", color: "#00C875" },
    ],
    columns: [
      STATUS,
      { title: "Owner", type: "person" },
      { title: "Due date", type: "date" },
      {
        title: "Priority",
        type: "dropdown",
        settings: {
          options: [
            { id: "opt_low", text: "Low" },
            { id: "opt_medium", text: "Medium" },
            { id: "opt_high", text: "High" },
          ],
        },
      },
    ],
    items: [
      {
        name: "Kickoff call with client",
        groupIndex: 0,
        values: {
          0: status("lbl_done"),
          2: due("2026-06-02"),
          3: opt("opt_medium"),
        },
      },
      {
        name: "Gather brand assets and access",
        groupIndex: 0,
        assignToCreator: true,
        values: { 0: status("lbl_working"), 3: opt("opt_medium") },
      },
      {
        name: "Homepage wireframes",
        groupIndex: 1,
        assignToCreator: true,
        values: { 0: status("lbl_working"), 3: opt("opt_high") },
      },
      {
        name: "Content copy draft — About & Services",
        groupIndex: 1,
        values: { 0: status("lbl_not_started"), 3: opt("opt_medium") },
      },
      {
        name: "Design concept v1 — awaiting feedback",
        groupIndex: 2,
        values: {
          0: status("lbl_stuck"),
          2: due("2026-06-20"),
          3: opt("opt_high"),
        },
      },
      {
        name: "Brand style guide",
        groupIndex: 3,
        values: { 0: status("lbl_done"), 2: due("2026-05-28") },
      },
    ],
  },
  {
    id: "creative-request-intake",
    name: "Creative Request Intake",
    category: "Agency",
    description:
      "A single front door for design/copy/video requests from anywhere in the org.",
    explainer:
      "Requests land in the first column with who asked and what they need — triage into In Progress, get sign-off in Needs Approval, and archive the rest in Completed.",
    groups: [
      { title: "New Requests", color: "#579BFC" },
      { title: "In Progress", color: "#FDAB3D" },
      { title: "Needs Approval", color: "#A25DDC" },
      { title: "Completed", color: "#00C875" },
    ],
    columns: [
      STATUS,
      { title: "Requester", type: "text" },
      {
        title: "Request Type",
        type: "dropdown",
        settings: {
          options: [
            { id: "opt_design", text: "Design" },
            { id: "opt_copy", text: "Copy" },
            { id: "opt_video", text: "Video" },
            { id: "opt_social", text: "Social" },
          ],
        },
      },
      { title: "Due date", type: "date" },
    ],
    items: [
      {
        name: "Instagram carousel for product launch",
        groupIndex: 0,
        values: {
          0: status("lbl_not_started"),
          1: { text: "Marketing" },
          2: opt("opt_social"),
        },
      },
      {
        name: "Email newsletter copy — Q3 update",
        groupIndex: 0,
        values: {
          0: status("lbl_not_started"),
          1: { text: "Priya (CS)" },
          2: opt("opt_copy"),
        },
      },
      {
        name: "Trade show banner design",
        groupIndex: 1,
        assignToCreator: true,
        values: {
          0: status("lbl_working"),
          1: { text: "Events team" },
          2: opt("opt_design"),
          3: due("2026-06-15"),
        },
      },
      {
        name: "Homepage hero video — 30s cut",
        groupIndex: 2,
        values: {
          0: status("lbl_stuck"),
          1: { text: "Leadership" },
          2: opt("opt_video"),
        },
      },
      {
        name: "Business card redesign",
        groupIndex: 3,
        values: {
          0: status("lbl_done"),
          1: { text: "Ops" },
          2: opt("opt_design"),
        },
      },
    ],
  },
  {
    id: "content-calendar",
    name: "Content Calendar",
    category: "Marketing",
    description:
      "Plan, draft, and schedule content across blog, social, and newsletter.",
    explainer:
      "Move a piece left to right as it matures — Ideas need nothing but a title, Scheduled needs a real publish date.",
    groups: [
      { title: "Ideas", color: "#579BFC" },
      { title: "Drafting", color: "#FDAB3D" },
      { title: "Editing", color: "#A25DDC" },
      { title: "Scheduled", color: "#00C875" },
    ],
    columns: [
      STATUS,
      {
        title: "Content Type",
        type: "dropdown",
        settings: {
          options: [
            { id: "opt_blog", text: "Blog" },
            { id: "opt_social", text: "Social" },
            { id: "opt_newsletter", text: "Newsletter" },
            { id: "opt_video", text: "Video" },
          ],
        },
      },
      { title: "Publish date", type: "date" },
      { title: "Owner", type: "person" },
    ],
    items: [
      {
        name: "5 lessons from our biggest client launch",
        groupIndex: 0,
        values: { 0: status("lbl_not_started"), 1: opt("opt_blog") },
      },
      {
        name: "Behind-the-scenes reel: studio day",
        groupIndex: 0,
        values: { 0: status("lbl_not_started"), 1: opt("opt_social") },
      },
      {
        name: "August product update newsletter",
        groupIndex: 1,
        assignToCreator: true,
        values: { 0: status("lbl_working"), 1: opt("opt_newsletter") },
      },
      {
        name: "Case study: 40% faster turnaround",
        groupIndex: 2,
        values: { 0: status("lbl_working"), 1: opt("opt_blog") },
      },
      {
        name: "Q3 roadmap teaser",
        groupIndex: 3,
        assignToCreator: true,
        values: {
          0: status("lbl_done"),
          1: opt("opt_social"),
          2: due("2026-06-10"),
        },
      },
    ],
  },
  {
    id: "simple-sprint",
    name: "Simple Sprint",
    category: "Product",
    description:
      "A lightweight sprint board — backlog through done, no ceremony.",
    explainer:
      "Story Points is just a number column, so totals show up in any grouped view. Nothing here is tied to a fixed sprint length — reset the board or duplicate it each cycle.",
    groups: [
      { title: "Backlog", color: "#A39A8D" },
      { title: "In Progress", color: "#FDAB3D" },
      { title: "In Review", color: "#A25DDC" },
      { title: "Done", color: "#00C875" },
    ],
    columns: [
      STATUS,
      { title: "Assignee", type: "person" },
      { title: "Story Points", type: "number" },
      {
        title: "Priority",
        type: "dropdown",
        settings: {
          options: [
            { id: "opt_low", text: "Low" },
            { id: "opt_medium", text: "Medium" },
            { id: "opt_high", text: "High" },
            { id: "opt_critical", text: "Critical" },
          ],
        },
      },
    ],
    items: [
      {
        name: "Set up CI pipeline for staging",
        groupIndex: 0,
        values: {
          0: status("lbl_not_started"),
          2: { number: 3 },
          3: opt("opt_medium"),
        },
      },
      {
        name: "Fix pagination bug on search results",
        groupIndex: 0,
        values: {
          0: status("lbl_not_started"),
          2: { number: 2 },
          3: opt("opt_high"),
        },
      },
      {
        name: "Implement password reset flow",
        groupIndex: 1,
        assignToCreator: true,
        values: {
          0: status("lbl_working"),
          2: { number: 5 },
          3: opt("opt_high"),
        },
      },
      {
        name: "Add rate limiting to public endpoints",
        groupIndex: 2,
        assignToCreator: true,
        values: {
          0: status("lbl_working"),
          2: { number: 3 },
          3: opt("opt_critical"),
        },
      },
      {
        name: "Write onboarding docs for new hires",
        groupIndex: 3,
        values: { 0: status("lbl_done"), 2: { number: 1 }, 3: opt("opt_low") },
      },
    ],
  },
  {
    id: "client-onboarding",
    name: "Client Onboarding",
    category: "Agency",
    description: "A repeatable checklist for bringing a new client on board.",
    explainer:
      "Duplicate this board per new client (or clear the Status column and reuse it) — four stages from first kickoff call to go-live.",
    groups: [
      { title: "Kickoff", color: "#579BFC" },
      { title: "Setup", color: "#FDAB3D" },
      { title: "Training", color: "#A25DDC" },
      { title: "Go-Live", color: "#00C875" },
    ],
    columns: [
      STATUS,
      { title: "Owner", type: "person" },
      { title: "Due date", type: "date" },
      { title: "Notes", type: "text" },
    ],
    items: [
      {
        name: "Send welcome packet and contract",
        groupIndex: 0,
        values: { 0: status("lbl_done"), 2: due("2026-06-01") },
      },
      {
        name: "Kickoff call — goals & stakeholders",
        groupIndex: 0,
        assignToCreator: true,
        values: { 0: status("lbl_working"), 2: due("2026-06-03") },
      },
      {
        name: "Collect brand assets and platform access",
        groupIndex: 1,
        values: {
          0: status("lbl_not_started"),
          3: { text: "Waiting on client IT" },
        },
      },
      {
        name: "Set up shared workspace and reporting cadence",
        groupIndex: 1,
        values: { 0: status("lbl_not_started") },
      },
      {
        name: "Train client team on approval workflow",
        groupIndex: 2,
        values: { 0: status("lbl_not_started") },
      },
      {
        name: "Go-live checklist review",
        groupIndex: 3,
        values: { 0: status("lbl_not_started") },
      },
    ],
  },
  {
    id: "bug-issue-tracker",
    name: "Bug/Issue Tracker",
    category: "Product",
    description: "Log, triage, and track bugs from report to fix.",
    explainer:
      "Severity drives triage order, not the Status column — group or sort by Severity when the New column gets long.",
    groups: [
      { title: "New", color: "#579BFC" },
      { title: "Confirmed", color: "#FDAB3D" },
      { title: "In Progress", color: "#A25DDC" },
      { title: "Fixed", color: "#00C875" },
    ],
    columns: [
      STATUS,
      {
        title: "Severity",
        type: "dropdown",
        settings: {
          options: [
            { id: "opt_low", text: "Low" },
            { id: "opt_medium", text: "Medium" },
            { id: "opt_high", text: "High" },
            { id: "opt_critical", text: "Critical" },
          ],
        },
      },
      { title: "Reporter", type: "text" },
      { title: "Due date", type: "date" },
    ],
    items: [
      {
        name: "Login form accepts empty password on Safari",
        groupIndex: 0,
        values: {
          0: status("lbl_not_started"),
          1: opt("opt_critical"),
          2: { text: "QA" },
        },
      },
      {
        name: "Table columns misalign after resizing",
        groupIndex: 0,
        values: {
          0: status("lbl_not_started"),
          1: opt("opt_medium"),
          2: { text: "Support" },
        },
      },
      {
        name: "Notification bell count doesn't clear",
        groupIndex: 1,
        values: {
          0: status("lbl_working"),
          1: opt("opt_low"),
          2: { text: "Internal" },
        },
      },
      {
        name: "Export CSV times out on large boards",
        groupIndex: 2,
        assignToCreator: true,
        values: {
          0: status("lbl_working"),
          1: opt("opt_high"),
          2: { text: "Customer ticket #482" },
          3: due("2026-06-12"),
        },
      },
      {
        name: "Date picker shows wrong month on load",
        groupIndex: 3,
        values: { 0: status("lbl_done"), 1: opt("opt_low"), 2: { text: "QA" } },
      },
    ],
  },
];

export function getTemplate(id: string): BoardTemplate | undefined {
  return BOARD_TEMPLATES.find((t) => t.id === id);
}
