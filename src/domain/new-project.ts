import type { BodyDoc, Project } from "./project";

export function createId(prefix: string): string {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}-${id}`;
}

export function newProject(): Project {
  const today = new Date();
  const documentDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  const body = (): BodyDoc => ({ type: "doc", content: [{ type: "paragraph" }] });
  return {
    schemaVersion: 1,
    projectId: createId("project"),
    title: "新規プロジェクト",
    documentDate,
    profile: {
      name: "",
      nameKana: "",
      birthDate: "",
      postalCode: "",
      address: "",
      addressKana: "",
      phone: "",
      email: "",
      photoAssetId: null,
    },
    resume: {
      education: [],
      employment: [],
      qualifications: [],
      motivation: body(),
      preferences: body(),
    },
    career: { summary: body(), positions: [], skills: [], selfPromotion: body() },
    templates: {
      resume: { id: "resume-standard", version: "1.0.0" },
      career: { id: "career-standard", version: "1.0.0" },
    },
    assets: [],
  };
}
