import type { ReactNode } from "react";
import { EditorSection } from "../../components/EditorSection";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import type {
  BodyDoc,
  Contact,
  HistoryRow,
  Project,
} from "../../domain/project";
import {
  ageOnDate,
  isYearMonth,
  effectiveDocumentDate,
  parseDate,
} from "../../domain/dates";
import { useLocalDate } from "../../components/useLocalDate";
import { createId } from "../../domain/new-project";
import { BodyEditor } from "../../editor/BodyEditor";

const contactFields = [
  ["postalCode", "郵便番号"],
  ["address", "住所"],
  ["addressKana", "住所ふりがな"],
  ["phone", "電話番号"],
  ["email", "メールアドレス"],
] as const;
const emptyContact = (): Contact => ({
  postalCode: "",
  address: "",
  addressKana: "",
  phone: "",
  email: "",
});

function ContactFields({
  contact,
  prefix,
  disabled,
  onChange,
}: {
  contact: Contact;
  prefix: string;
  disabled: boolean;
  onChange: (contact: Contact) => void;
}) {
  return (
    <div className="profile-grid">
      {contactFields.map(([key, title]) => (
        <label key={key}>
          {prefix}
          {title}
          <Input
            disabled={disabled}
            maxLength={1024}
            value={contact[key]}
            onChange={(event) =>
              onChange({ ...contact, [key]: event.target.value })
            }
          />
        </label>
      ))}
    </div>
  );
}

export function HistoryEditor({
  title,
  rows,
  disabled,
  onChange,
}: {
  title: string;
  rows: HistoryRow[];
  disabled: boolean;
  onChange: (rows: HistoryRow[]) => void;
}) {
  function move(index: number, direction: number) {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  return (
    <fieldset disabled={disabled} className="history-editor">
      <legend>{title}</legend>
      <p>年月は任意です。上へ／下へで表示順を変更できます（最大200行）。</p>
      {rows.map((row, index) => (
        <div className="history-row" key={row.id}>
          <label>
            {title} {index + 1} 年月
            <Input
              type="month"
              min="0001-01"
              max="9999-12"
              value={row.yearMonth}
              placeholder="YYYY-MM"
              onChange={(event) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id
                      ? { ...item, yearMonth: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          {row.yearMonth && !isYearMonth(row.yearMonth) && (
            <p role="alert">年月をYYYY-MMで入力してください。</p>
          )}
          <label>
            {title} {index + 1} 内容
            <Input
              maxLength={1024}
              value={row.text}
              onChange={(event) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id
                      ? { ...item, text: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <div className="row-actions">
            <Button
              variant="outline"
              size="sm"
              type="button"
              aria-label={`${title} ${index + 1} 上へ`}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              aria-label={`${title} ${index + 1} 下へ`}
              disabled={disabled || index === rows.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              aria-label={`${title} ${index + 1} 削除`}
              onClick={() =>
                onChange(rows.filter((item) => item.id !== row.id))
              }
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={disabled || rows.length >= 200}
        onClick={() =>
          onChange([
            ...rows,
            { id: createId("history"), yearMonth: "", text: "" },
          ])
        }
      >
        <Plus aria-hidden="true" /> {title}を追加
      </Button>
    </fieldset>
  );
}

export function ResumeEditor({
  project,
  disabled,
  editorKey,
  includeQualifications = true,
  includeProfile = true,
  profileExtras,
  qualificationsSection,
  onChange,
}: {
  project: Project;
  disabled: boolean;
  editorKey: number;
  includeQualifications?: boolean;
  includeProfile?: boolean;
  profileExtras?: ReactNode;
  qualificationsSection?: ReactNode;
  onChange: (project: Project) => void;
}) {
  return (
    <section aria-label="履歴書の編集" className="resume-editor">
      <h3>履歴書の項目</h3>
      {includeProfile && (
        <EditorSection value="profile" title="基本情報">
          <ProfileEditor project={project} disabled={disabled} onChange={onChange}>
            {profileExtras}
          </ProfileEditor>
        </EditorSection>
      )}
      <EditorSection value="history" title="学歴・職歴">
        {(
          [
            ["education", "学歴"],
            ["employment", "職歴"],
          ] as const
        ).map(([key, title]) => (
          <HistoryEditor
            key={key}
            title={title}
            rows={project.resume[key]}
            disabled={disabled}
            onChange={(rows) =>
              onChange({
                ...project,
                resume: { ...project.resume, [key]: rows },
              })
            }
          />
        ))}
      </EditorSection>
      {qualificationsSection ??
        (includeQualifications && (
          <EditorSection value="qualifications" title="免許・資格">
            <HistoryEditor
              title="免許・資格"
              rows={project.resume.qualifications}
              disabled={disabled}
              onChange={(qualifications) =>
                onChange({ ...project, resume: { ...project.resume, qualifications } })
              }
            />
          </EditorSection>
        ))}
      {(
        [
          ["motivation", "志望動機・特技・アピールポイント"],
          ["preferences", "本人希望欄"],
        ] as const
      ).map(([key, label]) => (
        <EditorSection key={key} value={key} title={key === "motivation" ? "志望動機" : "本人希望"}>
          <section aria-label={`${label}の編集`}>
            <h4>{label}</h4>
            <BodyEditor
              key={`${editorKey}-${key}`}
              label={label}
              editable={!disabled}
              initialContent={project.resume[key]}
              onChange={(body) =>
                onChange({
                  ...project,
                  resume: { ...project.resume, [key]: body as BodyDoc },
                })
              }
            />
          </section>
        </EditorSection>
      ))}
    </section>
  );
}

export function ProfileEditor({
  project,
  disabled,
  onChange,
  children,
}: {
  project: Project;
  disabled: boolean;
  onChange: (project: Project) => void;
  children?: ReactNode;
}) {
  const profile = project.profile;
  const today = useLocalDate();
  const date = effectiveDocumentDate(project, today);
  const age = ageOnDate(profile.birthDate, date);
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">基本情報</legend>
      {children}
      <label>
        プロジェクト名
        <Input
          maxLength={1024}
          value={project.title}
          onChange={(event) =>
            onChange({ ...project, title: event.target.value })
          }
        />
      </label>
      <label>
        書類日付
        <Input
          type="date"
          min="0001-01-01"
          max="9999-12-31"
          disabled={project.documentDateMode === "today"}
          value={date}
          onChange={(event) =>
            onChange({ ...project, documentDate: event.target.value })
          }
        />
      </label>
      <label className="checkbox-label">
        <Input
          type="checkbox"
          checked={project.documentDateMode === "today"}
          onChange={(event) =>
            onChange({
              ...project,
              documentDateMode: event.target.checked ? "today" : "fixed",
              documentDate:
                event.target.checked && !parseDate(project.documentDate)
                  ? today
                  : project.documentDate,
            })
          }
        />
        今日の日付を使う
      </label>
      {project.documentDateMode === "today" && (
        <p className="field-hint">
          PDF生成・書き出し時の今日の日付を使います。
        </p>
      )}
      <label>
        氏名ふりがな
        <Input
          maxLength={1024}
          value={profile.nameKana}
          onChange={(event) =>
            onChange({
              ...project,
              profile: { ...profile, nameKana: event.target.value },
            })
          }
        />
      </label>
      <label>
        生年月日
        <Input
          type="date"
          min="0001-01-01"
          max="9999-12-31"
          value={profile.birthDate}
          onChange={(event) =>
            onChange({
              ...project,
              profile: { ...profile, birthDate: event.target.value },
            })
          }
        />
      </label>
      <output aria-label="満年齢">
        {age === null ? "年齢未算出" : `満${age}歳（書類日付時点）`}
      </output>
      {profile.birthDate && age === null && (
        <p role="alert">
          生年月日と書類日付を確認してください。生年月日は書類日付以前にしてください。
        </p>
      )}
      <label>
        性別表示（任意）
        <Input
          maxLength={1024}
          value={profile.genderLabel ?? ""}
          onChange={(event) => {
            const { genderLabel: _gender, ...rest } = profile;
            onChange({
              ...project,
              profile: event.target.value
                ? { ...rest, genderLabel: event.target.value }
                : rest,
            });
          }}
        />
      </label>
      <ContactFields
        prefix="現住所・"
        contact={profile}
        disabled={disabled}
        onChange={(contact) =>
          onChange({ ...project, profile: { ...profile, ...contact } })
        }
      />
      <label className="checkbox-label">
        <Input
          type="checkbox"
          checked={profile.alternateContact !== undefined}
          onChange={(event) => {
            const { alternateContact: _contact, ...rest } = profile;
            onChange({
              ...project,
              profile: event.target.checked
                ? { ...rest, alternateContact: emptyContact() }
                : rest,
            });
          }}
        />
        別連絡先を入力
      </label>
      <p>
        現住所と異なる連絡先がある場合に入力します。オフにすると別連絡先の入力を削除します。
      </p>
      {profile.alternateContact && (
        <ContactFields
          prefix="別連絡先・"
          contact={profile.alternateContact}
          disabled={disabled}
          onChange={(contact) =>
            onChange({
              ...project,
              profile: { ...profile, alternateContact: contact },
            })
          }
        />
      )}
    </fieldset>
  );
}
