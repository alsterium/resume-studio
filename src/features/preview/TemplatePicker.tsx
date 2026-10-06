import { useState } from "react";
import type { AppClient, TemplateManifest } from "../../infrastructure/app-client";
import type { Project } from "../../domain/project";

export function TemplatePicker({
  client,
  project,
  disabled,
  onChange,
}: {
  client: AppClient;
  project: Project;
  disabled: boolean;
  onChange: (project: Project) => void;
}) {
  const [templates, setTemplates] = useState<TemplateManifest[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await client.listTemplates());
    } catch {
      setError("テンプレート一覧を取得できませんでした。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }
  return (
    <fieldset disabled={disabled || loading}>
      <legend>書類テンプレート</legend>
      <button type="button" onClick={() => void load()}>
        {loading ? "一覧を確認中…" : "テンプレート一覧を確認"}
      </button>
      {error && <p role="alert">{error}</p>}
      {(
        [
          ["resume", "履歴書"],
          ["career", "職務経歴書"],
        ] as const
      ).map(([kind, label]) => {
        const current = project.templates[kind];
        const options = templates?.filter(
          (template) =>
            template.documentKind === kind &&
            template.schemaVersions.includes(project.schemaVersion),
        );
        const value = JSON.stringify([current.id, current.version]);
        const available = options?.some(
          (template) => template.id === current.id && template.version === current.version,
        );
        return (
          <div key={kind}>
            <output>
              {label}：{current.id} / {current.version}
            </output>
            {options && (
              <label>
                {label}テンプレート
                <select
                  value={value}
                  onChange={(event) => {
                    const selected = options.find(
                      (template) =>
                        JSON.stringify([template.id, template.version]) === event.target.value,
                    );
                    if (selected)
                      onChange({
                        ...project,
                        templates: {
                          ...project.templates,
                          [kind]: { id: selected.id, version: selected.version },
                        },
                      });
                  }}
                >
                  {!available && (
                    <option value={value} disabled>
                      未対応：{current.id} / {current.version}
                    </option>
                  )}
                  {options.map((template) => (
                    <option
                      key={`${template.id}-${template.version}`}
                      value={JSON.stringify([template.id, template.version])}
                    >
                      {template.displayName} {template.version}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {options && !available && (
              <p role="alert">
                {label}の指定版は同梱されていません。利用可能な版を選択してください。
              </p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
