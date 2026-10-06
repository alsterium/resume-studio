import type { BodyDoc, Contact, HistoryRow, Project } from "../../domain/project";
import { ageOnDate, isYearMonth } from "../../domain/dates";
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
          <input
            disabled={disabled}
            maxLength={1024}
            value={contact[key]}
            onChange={(event) => onChange({ ...contact, [key]: event.target.value })}
          />
        </label>
      ))}
    </div>
  );
}

function HistoryEditor({
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
            <input
              type="month"
              min="0001-01"
              max="9999-12"
              value={row.yearMonth}
              placeholder="YYYY-MM"
              onChange={(event) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id ? { ...item, yearMonth: event.target.value } : item,
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
            <input
              maxLength={1024}
              value={row.text}
              onChange={(event) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id ? { ...item, text: event.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <div className="row-actions">
            <button
              type="button"
              aria-label={`${title} ${index + 1} 上へ`}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              上へ
            </button>
            <button
              type="button"
              aria-label={`${title} ${index + 1} 下へ`}
              disabled={disabled || index === rows.length - 1}
              onClick={() => move(index, 1)}
            >
              下へ
            </button>
            <button
              type="button"
              aria-label={`${title} ${index + 1} 削除`}
              onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
            >
              削除
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled || rows.length >= 200}
        onClick={() => onChange([...rows, { id: createId("history"), yearMonth: "", text: "" }])}
      >
        {title}を追加
      </button>
    </fieldset>
  );
}

export function ResumeEditor({
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
  const profile = project.profile;
  const age = ageOnDate(profile.birthDate, project.documentDate);
  return (
    <section aria-label="履歴書の編集" className="resume-editor">
      <h3>履歴書の項目</h3>
      <fieldset disabled={disabled}>
        <legend>基本情報</legend>
        <label>
          プロジェクト名
          <input
            maxLength={1024}
            value={project.title}
            onChange={(event) => onChange({ ...project, title: event.target.value })}
          />
        </label>
        <label>
          書類日付
          <input
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={project.documentDate}
            onChange={(event) => onChange({ ...project, documentDate: event.target.value })}
          />
        </label>
        <label>
          氏名ふりがな
          <input
            maxLength={1024}
            value={profile.nameKana}
            onChange={(event) =>
              onChange({ ...project, profile: { ...profile, nameKana: event.target.value } })
            }
          />
        </label>
        <label>
          生年月日
          <input
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={profile.birthDate}
            onChange={(event) =>
              onChange({ ...project, profile: { ...profile, birthDate: event.target.value } })
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
          <input
            maxLength={1024}
            value={profile.genderLabel ?? ""}
            onChange={(event) => {
              const { genderLabel: _gender, ...rest } = profile;
              onChange({
                ...project,
                profile: event.target.value ? { ...rest, genderLabel: event.target.value } : rest,
              });
            }}
          />
        </label>
        <ContactFields
          prefix="現住所・"
          contact={profile}
          disabled={disabled}
          onChange={(contact) => onChange({ ...project, profile: { ...profile, ...contact } })}
        />
        <label className="checkbox-label">
          <input
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
        <p>現住所と異なる連絡先がある場合に入力します。オフにすると別連絡先の入力を削除します。</p>
        {profile.alternateContact && (
          <ContactFields
            prefix="別連絡先・"
            contact={profile.alternateContact}
            disabled={disabled}
            onChange={(contact) =>
              onChange({ ...project, profile: { ...profile, alternateContact: contact } })
            }
          />
        )}
      </fieldset>
      {(
        [
          ["education", "学歴"],
          ["employment", "職歴"],
          ["qualifications", "免許・資格"],
        ] as const
      ).map(([key, title]) => (
        <HistoryEditor
          key={key}
          title={title}
          rows={project.resume[key]}
          disabled={disabled}
          onChange={(rows) => onChange({ ...project, resume: { ...project.resume, [key]: rows } })}
        />
      ))}
      {(
        [
          ["motivation", "志望動機・特技・アピールポイント"],
          ["preferences", "本人希望欄"],
        ] as const
      ).map(([key, label]) => (
        <section key={key} aria-label={`${label}の編集`}>
          <h4>{label}</h4>
          <BodyEditor
            key={`${editorKey}-${key}`}
            label={label}
            editable={!disabled}
            initialContent={project.resume[key]}
            onChange={(body) =>
              onChange({ ...project, resume: { ...project.resume, [key]: body as BodyDoc } })
            }
          />
        </section>
      ))}
    </section>
  );
}
