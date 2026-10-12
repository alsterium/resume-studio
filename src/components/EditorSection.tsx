import { createContext, useContext, type ReactNode } from "react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import {
  UserRound,
  GraduationCap,
  Award,
  PenLine,
  BriefcaseBusiness,
  ListChecks,
  FileText,
} from "lucide-react";

export const EditorNavigationContext = createContext<string[] | null>(null);

export function EditorSection({
  value,
  title,
  children,
}: {
  value: string;
  title: string;
  children: ReactNode;
}) {
  const expanded = useContext(EditorNavigationContext);
  if (expanded === null) return <section className="editor-section">{children}</section>;
  const Icon =
    value === "profile"
      ? UserRound
      : value === "history" || value === "researches"
        ? GraduationCap
        : value === "qualifications"
          ? Award
          : value === "positions"
            ? BriefcaseBusiness
            : value === "skills"
              ? ListChecks
              : value === "summary"
                ? FileText
                : PenLine;
  return (
    <AccordionItem value={value} className="editor-section">
      <AccordionTrigger className="section-trigger" aria-label={title + "を編集"}>
        <span className="section-label">
          <Icon aria-hidden="true" />
          {title}
        </span>
      </AccordionTrigger>
      <AccordionContent
        forceMount
        hidden={!expanded.includes(value)}
        className="section-content"
        aria-labelledby={undefined}
        aria-label={title + "の入力欄"}
      >
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
