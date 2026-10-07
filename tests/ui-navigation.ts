import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

type User = ReturnType<typeof userEvent.setup>;

export async function expandSections(user: User) {
  for (const button of screen
    .queryAllByRole("button")
    .filter(
      (element) =>
        element.dataset.slot === "accordion-trigger" &&
        element.getAttribute("aria-expanded") === "false",
    )) {
    await user.click(button);
  }
}

export async function openSummary(user: User) {
  await user.click(screen.getByRole("tab", { name: "職務経歴書" }));
  await expandSections(user);
}

export async function projectMenu(user: User) {
  await user.click(screen.getByRole("button", { name: "その他のプロジェクト操作" }));
}
