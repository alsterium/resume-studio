export type BodyMark = { type: "bold" | "italic" };
export type InlineNode = { type: "text"; text: string; marks?: BodyMark[] } | { type: "hardBreak" };
export type Paragraph = { type: "paragraph"; content?: InlineNode[] };
export type ListItem = { type: "listItem"; content: BlockNode[] };
export type BlockNode =
  | Paragraph
  | { type: "bulletList"; content: ListItem[] }
  | { type: "orderedList"; content: ListItem[]; attrs?: { start?: number; type?: null } };
export type BodyDoc = { type: "doc"; content?: BlockNode[] };
export interface Contact {
  postalCode: string;
  address: string;
  addressKana: string;
  phone: string;
  email: string;
}
export interface Profile extends Contact {
  name: string;
  nameKana: string;
  birthDate: string;
  photoAssetId: string | null;
  genderLabel?: string;
  alternateContact?: Contact;
}
export interface HistoryRow {
  id: string;
  yearMonth: string;
  text: string;
}
export interface CareerProject {
  id: string;
  name: string;
  startYearMonth: string;
  endYearMonth: string | null;
  overview: BodyDoc;
  phases: string[];
  responsibilities: BodyDoc;
  achievements: BodyDoc;
  teamSize: string;
  languages: string[];
  technologies: string[];
  url?: string;
}
export interface Position {
  id: string;
  companyName: string;
  startYearMonth: string;
  endYearMonth: string | null;
  role: string;
  companyOverview?: { business?: string; capital?: string; employees?: string };
  projects: CareerProject[];
}
export interface Skill {
  id: string;
  name: string;
  experienceLabel: string;
  description: string;
}
export interface TemplateRef {
  id: string;
  version: string;
}
export interface Asset {
  id: string;
  mediaType: "image/jpeg" | "image/png";
  base64: string;
}
export interface Project {
  schemaVersion: 1;
  projectId: string;
  title: string;
  documentDate: string;
  profile: Profile;
  resume: {
    education: HistoryRow[];
    employment: HistoryRow[];
    qualifications: HistoryRow[];
    motivation: BodyDoc;
    preferences: BodyDoc;
  };
  career: {
    summary: BodyDoc;
    positions: Position[];
    skills: Skill[];
    selfPromotion: BodyDoc;
  };
  templates: { resume: TemplateRef; career: TemplateRef };
  assets: Asset[];
}
