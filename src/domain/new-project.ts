import type { BodyDoc, Project } from "./project";
import { localDate } from "./dates";

export function createId(prefix: string): string {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}-${id}`;
}

export function newProject(): Project {
  const documentDate = localDate();
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
    career: {
      summary: body(),
      positions: [],
      researches: [],
      skills: [],
      qualifications: [],
      selfPromotion: body(),
    },
    templates: {
      resume: { id: "resume-standard", version: "1.2.0" },
      career: { id: "career-standard", version: "1.2.0" },
    },
    assets: [],
  };
}
