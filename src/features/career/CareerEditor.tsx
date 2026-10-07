import { EditorSection } from "../../components/EditorSection";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { useState } from "react";
import type { BodyDoc, CareerProject, Position, Project } from "../../domain/project";
import { createId } from "../../domain/new-project";
import { isYearMonth } from "../../domain/dates";
import { BodyEditor } from "../../editor/BodyEditor";

const emptyBody = (): BodyDoc => ({ type: "doc", content: [{ type: "paragraph" }] });
function newPosition(): Position {
  return {
    id: createId("company"),
    companyName: "",
    role: "",
    startYearMonth: "",
    endYearMonth: null,
    projects: [],
  };
}
function newCareerProject(): CareerProject {
  return {
    id: createId("case"),
    name: "",
    startYearMonth: "",
    endYearMonth: null,
    overview: emptyBody(),
    responsibilities: emptyBody(),
    achievements: emptyBody(),
    phases: [],
    languages: [],
    technologies: [],
    teamSize: "",
  };
}

function TextField({
  label,
  value,
  onChange,
  maxLength = 1024,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  return (
    <label>
      {label}
      <Input
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function PeriodFields({
  prefix,
  ongoing,
  start,
  end,
  onChange,
}: {
  prefix: string;
  ongoing: string;
  start: string;
  end: string | null;
  onChange: (start: string, end: string | null) => void;
}) {
  const invalid =
    (start && !isYearMonth(start)) || (end && !isYearMonth(end)) || (start && end && end < start);
  return (
    <div>
      <label>
        {prefix}開始年月
        <Input
          type="month"
          min="0001-01"
          max="9999-12"
          value={start}
          onChange={(event) => onChange(event.target.value, end)}
        />
      </label>
      <label className="checkbox-label">
        <Input
          type="checkbox"
          checked={end === null}
          onChange={(event) => onChange(start, event.target.checked ? null : "")}
        />
        {ongoing}
      </label>
      {end !== null && (
        <label>
          {prefix}終了年月
          <Input
            type="month"
            min="0001-01"
            max="9999-12"
            value={end}
            onChange={(event) => onChange(start, event.target.value)}
          />
        </label>
      )}
      {invalid && (
        <p role="alert">{prefix}の年月を確認してください。終了年月は開始年月以降にしてください。</p>
      )}
    </div>
  );
}

function ListField({
  title,
  items,
  onChange,
}: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <fieldset>
      <legend>{title}</legend>
      {items.map((item, index) => (
        <div key={index}>
          <TextField
            label={`${title} ${index + 1}`}
            value={item}
            onChange={(value) =>
              onChange(items.map((current, itemIndex) => (itemIndex === index ? value : current)))
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`${title} ${index + 1} 削除`}
            onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={items.length >= 50}
        onClick={() => onChange([...items, ""])}
      >
        {title}を追加
      </Button>
      <p>最大50項目。入力した順で表示します。</p>
    </fieldset>
  );
}

function OrderActions({
  label,
  index,
  count,
  onMove,
  onDelete,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (direction: number) => void;
  onDelete: () => void;
}) {
  return (
    <div className="row-actions">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`${label} 上へ`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`${label} 下へ`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`${label} 削除`}
        onClick={onDelete}
      >
        削除
      </Button>
    </div>
  );
}
function moved<T>(items: T[], index: number, direction: number): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

function ProjectEditor({
  item,
  disabled,
  onChange,
}: {
  item: CareerProject;
  disabled: boolean;
  onChange: (item: CareerProject) => void;
}) {
  let invalidUrl = false;
  if (item.url) {
    try {
      const url = new URL(item.url);
      invalidUrl = !url.hostname || !["http:", "https:"].includes(url.protocol);
    } catch {
      invalidUrl = true;
    }
  }
  return (
    <div>
      <TextField
        label="案件名"
        value={item.name}
        onChange={(name) => onChange({ ...item, name })}
      />
      <PeriodFields
        prefix="案件"
        ongoing="進行中"
        start={item.startYearMonth}
        end={item.endYearMonth}
        onChange={(startYearMonth, endYearMonth) =>
          onChange({ ...item, startYearMonth, endYearMonth })
        }
      />
      {(
        [
          ["overview", "プロジェクト概要"],
          ["responsibilities", "業務内容"],
          ["achievements", "実績・取り組み"],
        ] as const
      ).map(([key, label]) => (
        <section key={key}>
          <h4>{label}</h4>
          <BodyEditor
            label={label}
            editable={!disabled}
            initialContent={item[key]}
            onChange={(body) => onChange({ ...item, [key]: body as BodyDoc })}
          />
        </section>
      ))}
      {(
        [
          ["phases", "担当フェーズ"],
          ["languages", "使用言語"],
          ["technologies", "使用技術"],
        ] as const
      ).map(([key, title]) => (
        <ListField
          key={key}
          title={title}
          items={item[key]}
          onChange={(items) => onChange({ ...item, [key]: items })}
        />
      ))}
      <TextField
        label="プロジェクト規模"
        value={item.teamSize}
        onChange={(teamSize) => onChange({ ...item, teamSize })}
      />
      <TextField
        label="案件URL（任意）"
        maxLength={2048}
        value={item.url ?? ""}
        onChange={(url) => {
          const { url: _url, ...rest } = item;
          onChange(url ? { ...rest, url } : rest);
        }}
      />
      {invalidUrl && <p role="alert">案件URLはホストを含むhttp/httpsで入力してください。</p>}
    </div>
  );
}

export function CareerEditor({
  project,
  disabled,
  editorKey,
  onChange,
}: {
  project: Project;
  disabled: boolean;
  editorKey: number;
  onChange: (project: Project) => void;
}) {
  const career = project.career;
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const company = career.positions.find((item) => item.id === companyId) ?? career.positions[0];
  const companyIndex = company ? career.positions.indexOf(company) : -1;
  const item = company?.projects.find((item) => item.id === caseId) ?? company?.projects[0];
  const caseIndex = item && company ? company.projects.indexOf(item) : -1;
  const updateCompany = (updated: Position) =>
    onChange({
      ...project,
      career: {
        ...career,
        positions: career.positions.map((value) => (value.id === updated.id ? updated : value)),
      },
    });
  const updatePositions = (positions: Position[]) =>
    onChange({ ...project, career: { ...career, positions } });
  return (
    <section aria-label="職務経歴書の編集" className="career-editor">
      <h3>職務経歴書の項目</h3>
      <EditorSection value="positions" title="職務経歴">
        <fieldset disabled={disabled}>
          <legend>職務経歴</legend>
          <p>会社と案件を選んで編集します。選択の変更は入力内容を保持します。</p>
          {company && (
            <label>
              編集する会社
              <select
                value={company.id}
                onChange={(event) => {
                  setCompanyId(event.target.value);
                  setCaseId(null);
                }}
              >
                {career.positions.map((value, index) => (
                  <option key={value.id} value={value.id}>
                    {index + 1}. {value.companyName || "会社名未入力"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={career.positions.length >= 100}
            onClick={() => {
              const next = newPosition();
              updatePositions([...career.positions, next]);
              setCompanyId(next.id);
              setCaseId(null);
            }}
          >
            <Plus aria-hidden="true" />
            会社を追加
          </Button>
          {company && (
            <div key={company.id}>
              <OrderActions
                label="会社"
                index={companyIndex}
                count={career.positions.length}
                onMove={(direction) =>
                  updatePositions(moved(career.positions, companyIndex, direction))
                }
                onDelete={() =>
                  updatePositions(career.positions.filter((value) => value.id !== company.id))
                }
              />
              <p>会社を削除すると配下の案件も削除します。</p>
              <TextField
                label="会社名"
                value={company.companyName}
                onChange={(companyName) => updateCompany({ ...company, companyName })}
              />
              <TextField
                label="役職・役割"
                value={company.role}
                onChange={(role) => updateCompany({ ...company, role })}
              />
              <PeriodFields
                prefix="会社"
                ongoing="在籍中"
                start={company.startYearMonth}
                end={company.endYearMonth}
                onChange={(startYearMonth, endYearMonth) =>
                  updateCompany({ ...company, startYearMonth, endYearMonth })
                }
              />
              {(
                [
                  ["business", "事業内容"],
                  ["capital", "資本金"],
                  ["employees", "従業員数"],
                ] as const
              ).map(([key, label]) => (
                <TextField
                  key={key}
                  label={label}
                  value={company.companyOverview?.[key] ?? ""}
                  onChange={(value) => {
                    const overview = { ...company.companyOverview };
                    if (value) overview[key] = value;
                    else delete overview[key];
                    const { companyOverview: _overview, ...rest } = company;
                    updateCompany(
                      Object.keys(overview).length ? { ...rest, companyOverview: overview } : rest,
                    );
                  }}
                />
              ))}
              <fieldset>
                <legend>主な実績・案件</legend>
                {item && (
                  <label>
                    編集する案件
                    <select value={item.id} onChange={(event) => setCaseId(event.target.value)}>
                      {company.projects.map((value, index) => (
                        <option key={value.id} value={value.id}>
                          {index + 1}. {value.name || "案件名未入力"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={company.projects.length >= 200}
                  onClick={() => {
                    const next = newCareerProject();
                    updateCompany({ ...company, projects: [...company.projects, next] });
                    setCaseId(next.id);
                  }}
                >
                  <Plus aria-hidden="true" />
                  案件を追加
                </Button>
                {item && (
                  <div key={item.id}>
                    <OrderActions
                      label="案件"
                      index={caseIndex}
                      count={company.projects.length}
                      onMove={(direction) =>
                        updateCompany({
                          ...company,
                          projects: moved(company.projects, caseIndex, direction),
                        })
                      }
                      onDelete={() =>
                        updateCompany({
                          ...company,
                          projects: company.projects.filter((value) => value.id !== item.id),
                        })
                      }
                    />
                    <ProjectEditor
                      item={item}
                      disabled={disabled}
                      onChange={(updated) =>
                        updateCompany({
                          ...company,
                          projects: company.projects.map((value) =>
                            value.id === item.id ? updated : value,
                          ),
                        })
                      }
                    />
                  </div>
                )}
              </fieldset>
            </div>
          )}
        </fieldset>
      </EditorSection>
      <EditorSection value="skills" title="スキル">
        <fieldset disabled={disabled}>
          <legend>活かせるスキル・経験</legend>
          {career.skills.map((skill, index) => (
            <div key={skill.id} className="history-row">
              {(
                [
                  ["name", "スキル名"],
                  ["experienceLabel", "経験期間"],
                  ["description", "説明"],
                ] as const
              ).map(([key, title]) => (
                <TextField
                  key={key}
                  label={`スキル ${index + 1} ${title}`}
                  value={skill[key]}
                  onChange={(value) =>
                    onChange({
                      ...project,
                      career: {
                        ...career,
                        skills: career.skills.map((current) =>
                          current.id === skill.id ? { ...current, [key]: value } : current,
                        ),
                      },
                    })
                  }
                />
              ))}
              <OrderActions
                label={`スキル ${index + 1}`}
                index={index}
                count={career.skills.length}
                onMove={(direction) =>
                  onChange({
                    ...project,
                    career: { ...career, skills: moved(career.skills, index, direction) },
                  })
                }
                onDelete={() =>
                  onChange({
                    ...project,
                    career: {
                      ...career,
                      skills: career.skills.filter((value) => value.id !== skill.id),
                    },
                  })
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={career.skills.length >= 200}
            onClick={() =>
              onChange({
                ...project,
                career: {
                  ...career,
                  skills: [
                    ...career.skills,
                    { id: createId("skill"), name: "", experienceLabel: "", description: "" },
                  ],
                },
              })
            }
          >
            <Plus aria-hidden="true" />
            スキルを追加
          </Button>
        </fieldset>
      </EditorSection>
      <EditorSection value="selfPromotion" title="自己PR">
        <h4>自己PR</h4>
        <BodyEditor
          key={`${editorKey}-self-promotion`}
          label="自己PR"
          editable={!disabled}
          initialContent={career.selfPromotion}
          onChange={(body) =>
            onChange({ ...project, career: { ...career, selfPromotion: body as BodyDoc } })
          }
        />
      </EditorSection>
    </section>
  );
}
