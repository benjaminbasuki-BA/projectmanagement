import { test, expect, type Locator } from "@playwright/test";

/**
 * doc11 §"MVP completion" — drag flow: dragging a kanban card
 * (KanbanView.tsx, dnd-kit useDraggable/useDroppable) into another lane
 * writes the underlying status column value, the same optimistic cell
 * mutation the table view uses.
 *
 * dnd-kit's PointerSensor needs real, stepped pointer movement past its
 * activation distance (6px) before it recognizes a drag — a single
 * jump from A to B never starts one, so this drives page.mouse
 * directly instead of a plain click.
 */
async function laneByLabel(
  page: import("@playwright/test").Page,
  label: string,
): Promise<Locator> {
  return page
    .locator("div.rounded-lg.border.bg-neutral-50")
    .filter({ hasText: label })
    .first();
}

test("drags a card from Not started into Done and the status updates", async ({
  page,
}) => {
  await page.goto("/");
  // Scoped to the sidebar — the home page also lists boards by name, so
  // an unscoped locator matches both.
  await page.locator("aside").getByRole("link", { name: "Projector" }).click();
  await expect(page).toHaveURL(/\/boards\//);
  await page.getByRole("button", { name: "Kanban" }).click();

  const notStarted = await laneByLabel(page, "Not started");
  const done = await laneByLabel(page, "Done");
  const card = notStarted.getByText("Room 114 ceiling mount");
  await expect(card).toBeVisible();

  const cardBox = (await card.boundingBox())!;
  const doneBox = (await done.boundingBox())!;

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2,
  );
  await page.mouse.down();
  // Small nudge first — clears dnd-kit's 6px activation threshold before
  // the real move toward the target lane.
  await page.mouse.move(
    cardBox.x + cardBox.width / 2 + 15,
    cardBox.y + cardBox.height / 2,
    { steps: 5 },
  );
  await page.mouse.move(doneBox.x + doneBox.width / 2, doneBox.y + 80, {
    steps: 15,
  });
  await page.mouse.up();

  await expect(done.getByText("Room 114 ceiling mount")).toBeVisible();
  await expect(notStarted.getByText("Room 114 ceiling mount")).toHaveCount(0);

  // Confirm it's a real write, not just where the card visually landed.
  await page.reload();
  await page.getByRole("button", { name: "Kanban" }).click();
  await expect(
    (await laneByLabel(page, "Done")).getByText("Room 114 ceiling mount"),
  ).toBeVisible();
});
