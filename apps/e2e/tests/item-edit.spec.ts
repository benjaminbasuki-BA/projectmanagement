import { test, expect } from "@playwright/test";

/**
 * doc11 §"MVP completion" — "Playwright coverage of drag, edit, panel
 * flows." This one: inline rename in the table view (TableView.tsx),
 * the spreadsheet-fast edit path the product's whole pitch rests on.
 */
test("renames an item inline from the table view and the rename persists", async ({
  page,
}) => {
  await page.goto("/");
  // Scoped to the sidebar — the home page also lists boards by name, so
  // an unscoped locator matches both.
  await page.locator("aside").getByRole("link", { name: "Laptop" }).click();
  await expect(page).toHaveURL(/\/boards\//);

  const original = "Dell XPS 15 — Lab 2 refresh";
  const renamed = `Dell XPS 15 — Lab 2 refresh (RMA'd) ${Date.now()}`;

  const row = page.locator("tr", { hasText: original });
  await row.hover();
  await row.locator('button[title="Rename"]').click();

  // Once rename mode starts, the item name is an input value rather than
  // row text, so the `hasText` row locator above intentionally no longer
  // matches. The editor receives focus when it appears.
  const input = page.locator("input:focus");
  await expect(input).toHaveValue(original);
  await input.fill(renamed);
  await input.press("Enter");

  await expect(page.getByRole("button", { name: renamed })).toBeVisible();

  // Reload to prove it actually persisted server-side, not just local state.
  await page.reload();
  await expect(
    page.locator("tr", { hasText: renamed }).getByRole("button", {
      name: renamed,
    }),
  ).toBeVisible();
});
