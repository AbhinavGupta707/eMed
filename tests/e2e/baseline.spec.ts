import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("baseline shell is explicit, responsive, and has no serious accessibility findings", async ({
  page
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Good morning, Maya."
    })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a check-in" })).toBeVisible();
  await expect(page.getByText(/HomeRounds cannot diagnose a condition/i)).toBeVisible();
  await expect(page.getByText("Sample profile · Not medical care")).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? "")
  );

  expect(serious).toEqual([]);
});
