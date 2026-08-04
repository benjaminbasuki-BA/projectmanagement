/**
 * Default labels for a new status column — doc 01 §2.2: "Default labels
 * on new status columns: Not started (gray), Working on it (orange),
 * Stuck (red), Done (green ✓)". Label ids are stable; renames later only
 * touch the text (doc 02 §3.2).
 *
 * Colors per design.md §3.3. These are safe at this saturation because the
 * label text is always drawn *beside* the bar in ink, never on top of the
 * color — so the bar only has to clear 3:1 as a graphical object, not 4.5:1
 * as text. Label *order* is load-bearing: it drives the status fill's
 * length (design.md §10).
 */
export const DEFAULT_STATUS_SETTINGS = {
  labels: [
    {
      id: "lbl_not_started",
      text: "Not started",
      color: "#A39A8D",
      is_done: false,
    },
    {
      id: "lbl_working",
      text: "Working on it",
      color: "#E08A1E",
      is_done: false,
    },
    { id: "lbl_stuck", text: "Stuck", color: "#C4432F", is_done: false },
    { id: "lbl_done", text: "Done", color: "#4E8A5C", is_done: true },
  ],
};
