import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, test } from "vitest";
import { DraftWorkspace } from "../../src/features/preview/DraftWorkspace";
import { tauriClient } from "../../src/infrastructure/app-client";
import { validateProject } from "../../src/domain/validate-project";
import fixture from "../fixtures/project-full.json";

test("未選択の写真が4枚あるJSONでも、保存済み写真を選んで削除し取り込みを再開できる", async () => {
  const project = validateProject(structuredClone(fixture));
  project.profile.photoAssetId = null;
  project.assets = Array.from({ length: 4 }, (_, index) => ({
    ...project.assets[0],
    id: `photo-${index + 1}`,
  }));
  let imports = 0;
  mockIPC((command) => {
    if (command === "open_project") return { project, fileId: "1", displayName: "写真4枚.json" };
    expect(command).toBe("import_photo");
    imports += 1;
    return { mediaType: "image/png", base64: fixture.assets[0].base64, width: 3, height: 4 };
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  await user.click(screen.getByRole("button", { name: "開く" }));
  await user.click(screen.getByRole("button", { name: "写真を取り込む" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("4枚以内");
  expect(imports).toBe(0);
  await user.selectOptions(screen.getByLabelText("保存済み写真"), "photo-2");
  await user.click(screen.getByRole("button", { name: "写真を削除" }));
  await user.click(screen.getByRole("button", { name: "写真を取り込む" }));
  expect(imports).toBe(1);
  expect(screen.getByAltText("取り込んだ証明写真")).toBeVisible();
});

test("写真の取り込み・置換・削除で参照と埋込を更新し、書類全体と一緒に保存する", async () => {
  let imports = 0;
  let saves = 0;
  mockIPC((command, args) => {
    if (command === "import_photo") {
      imports += 1;
      return { mediaType: "image/png", base64: fixture.assets[0].base64, width: 3, height: 4 };
    }
    expect(command).toBe("save_project");
    if (!args || Array.isArray(args) || args instanceof ArrayBuffer || args instanceof Uint8Array)
      throw new Error("save arguments required");
    const project = validateProject(args.project);
    if (saves < 2) {
      expect(project.assets).toHaveLength(1);
      expect(project.profile.photoAssetId).toBe(project.assets[0].id);
      expect(project.assets[0].base64).toBe(fixture.assets[0].base64);
    } else {
      expect(project.assets).toHaveLength(0);
      expect(project.profile.photoAssetId).toBeNull();
    }
    saves += 1;
    return { fileId: String(saves), displayName: "写真付き.json" };
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  for (let iteration = 0; iteration < 2; iteration++) {
    await user.click(screen.getByRole("button", { name: "写真を取り込む" }));
    expect(await screen.findByAltText("取り込んだ証明写真")).toHaveAttribute(
      "src",
      `data:image/png;base64,${fixture.assets[0].base64}`,
    );
    expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存");
    const image = screen.getByAltText("取り込んだ証明写真");
    await user.click(screen.getByRole("tab", { name: "職務経歴書" }));
    expect(screen.queryByRole("button", { name: "写真を取り込む" })).toBeNull();
    expect(screen.queryByRole("button", { name: "写真を削除" })).toBeNull();
    expect(image).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "保存" }));
    await user.click(screen.getByRole("tab", { name: "履歴書" }));
    expect(image).toBeVisible();
    expect(screen.getByRole("button", { name: "写真を取り込む" })).toBeVisible();
  }
  expect(imports).toBe(2);
  await user.click(screen.getByRole("button", { name: "写真を削除" }));
  expect(screen.queryByAltText("取り込んだ証明写真")).toBeNull();
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(saves).toBe(3);
});

test("読み込みで埋込写真を復元し、取り込み失敗・キャンセルでは写真と入力を維持する", async () => {
  let fail = true;
  mockIPC((command) => {
    if (command === "open_project")
      return { project: fixture, fileId: "1", displayName: "移動後.json" };
    expect(command).toBe("import_photo");
    if (fail) throw "写真を読み込めませんでした。";
    return null;
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  await user.click(screen.getByRole("button", { name: "開く" }));
  const photo = screen.getByAltText("取り込んだ証明写真");
  await user.click(screen.getByRole("button", { name: "写真を取り込む" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("写真を読み込めません");
  expect(screen.getByAltText("取り込んだ証明写真")).toBe(photo);
  expect(screen.getByLabelText("氏名")).toHaveValue(fixture.profile.name);
  fail = false;
  await user.click(screen.getByRole("button", { name: "写真を取り込む" }));
  expect(screen.getByAltText("取り込んだ証明写真")).toBe(photo);
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("保存済み");
});
