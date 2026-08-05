import { test, expect } from "@playwright/test";

/**
 * doc11 §"MVP completion" — panel flow: open an item's detail panel
 * (ItemPanel.tsx, driven by the `?item=` URL param) and post a comment
 * from its Updates tab (CommentsTab.tsx).
 */
test("opens an item's panel, posts a comment, and it appears in Updates", async ({
  page,
}) => {
  await page.goto("/");
  // Scoped to the sidebar — the home page also lists boards by name, so
  // an unscoped locator matches both.
  await page.locator("aside").getByRole("link", { name: "Desktop" }).click();
  await expect(page).toHaveURL(/\/boards\//);

  const row = page.locator("tr", { hasText: "Testing center thin clients" });
  await row
    .getByRole("button", { name: "Testing center thin clients" })
    .click();

  await expect(page).toHaveURL(/[?&]item=/);
  // `.fixed` distinguishes the slide-over panel from the sidebar, which
  // is also an <aside> and stays mounted the whole time.
  const panel = page.locator("aside.fixed");
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Updates" }).click();

  const comment = `Swapped the power supply — ${Date.now()}`;
  await panel
    .getByPlaceholder("Post an update… (@ to mention someone)")
    .fill(comment);
  await panel.getByRole("button", { name: "Comment" }).click();

  await expect(panel.getByText(comment)).toBeVisible();

  // Closing and reopening proves the comment round-tripped through the
  // API rather than only existing in the composer's local state.
  await panel.getByRole("button", { name: "Close (Esc)" }).click();
  await expect(panel).not.toBeVisible();

  await row
    .getByRole("button", { name: "Testing center thin clients" })
    .click();
  await panel.getByRole("button", { name: "Updates" }).click();
  await expect(panel.getByText(comment)).toBeVisible();
});
