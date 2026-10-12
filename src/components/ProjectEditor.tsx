import { useState, type ReactNode } from "react";
import type { JSONContent } from "@tiptap/core";
import type { BodyDoc, Project } from "../domain/project";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Accordion } from "./ui/accordion";
import { EditorNavigationContext, EditorSection } from "./EditorSection";
import { HistoryEditor, ProfileEditor, ResumeEditor } from "../features/resume/ResumeEditor";
import { CareerEditor } from "../features/career/CareerEditor";
import { BodyEditor } from "../editor/BodyEditor";

export function ProjectEditor({
  project,
  document,
  onDocumentChange,
  disabled: editorDisabled,
  photoBusy,
  editorKey,
  onChange: updateProject,
  onImportPhoto: importPhoto,
  onRemovePhoto: removePhoto,
  footer,
}: {
  project: Project;
  document: "履歴書" | "職務経歴書";
  onDocumentChange: (value: "履歴書" | "職務経歴書") => void;
  disabled: boolean;
  photoBusy: boolean;
  editorKey: number;
  onChange: (project: Project) => void;
  onImportPhoto: () => void | Promise<void>;
  onRemovePhoto: () => void;
  footer?: ReactNode;
}) {
  const [expandedByDocument, setExpandedByDocument] = useState<Record<string, string[]>>({
    履歴書: ["profile"],
    職務経歴書: ["profile"],
  });
  const expanded = expandedByDocument[document];

  const selectedKind = document === "履歴書" ? "resume" : "career";
  const name = project.profile.name;
  const body = project.career.summary;
  const photo = project.assets.find((asset) => asset.id === project.profile.photoAssetId);
  const qualificationsSection = (
    <EditorSection value="qualifications" title="免許・資格">
      <HistoryEditor
        title="免許・資格"
        rows={project[selectedKind].qualifications}
        disabled={editorDisabled}
        onChange={(qualifications) =>
          updateProject({
            ...project,
            [selectedKind]: { ...project[selectedKind], qualifications },
          })
        }
      />
      <p className="field-hint">{document}に掲載する免許・資格を入力します。</p>
    </EditorSection>
  );

  return (
    <div className="inspector">
      <Tabs
        value={document}
        onValueChange={(value) => {
          const next = value as "履歴書" | "職務経歴書";
          onDocumentChange(next);
        }}
        className="document-tabs"
      >
        <TabsList aria-label="書類の選択">
          <TabsTrigger value="履歴書">履歴書</TabsTrigger>
          <TabsTrigger value="職務経歴書">職務経歴書</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="draft-editor inspector-scroll" aria-label="編集パネル">
        <EditorNavigationContext value={expanded}>
          <Accordion
            type="multiple"
            value={expanded}
            onValueChange={(values) =>
              setExpandedByDocument((current) => ({ ...current, [document]: values }))
            }
          >
            <EditorSection value="profile" title="基本情報">
              <ProfileEditor project={project} disabled={editorDisabled} onChange={updateProject}>
                <label>
                  氏名
                  <input
                    disabled={editorDisabled}
                    value={name}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateProject({ ...project, profile: { ...project.profile, name: value } });
                    }}
                  />
                </label>
                <div aria-label="証明写真" hidden={document !== "履歴書"}>
                  {project.assets.length > 0 && (
                    <label>
                      保存済み写真
                      <select
                        disabled={photoBusy || editorDisabled}
                        value={project.profile.photoAssetId ?? ""}
                        onChange={(event) => {
                          const photoAssetId = event.target.value || null;
                          updateProject({
                            ...project,
                            profile: { ...project.profile, photoAssetId },
                          });
                        }}
                      >
                        <option value="">写真なし</option>
                        {project.assets.map((asset, index) => (
                          <option key={asset.id} value={asset.id}>
                            写真 {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {photo ? (
                    <img
                      src={`data:${photo.mediaType};base64,${photo.base64}`}
                      alt="取り込んだ証明写真"
                      width={90}
                      height={120}
                      style={{ objectFit: "contain" }}
                    />
                  ) : (
                    <p>写真なし</p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={photoBusy || editorDisabled}
                    onClick={() => void importPhoto()}
                  >
                    写真を取り込む
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={!photo || photoBusy || editorDisabled}
                    onClick={removePhoto}
                  >
                    写真を削除
                  </Button>
                  <p>JPEG／PNG、5MiB以内。縦横比を保ち最大600×800pxへ調整します。</p>
                </div>
              </ProfileEditor>
            </EditorSection>
            <div hidden={document !== "履歴書"}>
              <ResumeEditor
                project={project}
                includeProfile={false}
                includeQualifications={false}
                qualificationsSection={document === "履歴書" ? qualificationsSection : undefined}
                disabled={editorDisabled}
                editorKey={editorKey}
                onChange={updateProject}
              />
            </div>
            <div hidden={document !== "職務経歴書"}>
              <EditorSection value="summary" title="職務要約">
                <BodyEditor
                  key={editorKey}
                  initialContent={body as JSONContent}
                  editable={!editorDisabled}
                  onChange={(content) =>
                    updateProject({
                      ...project,
                      career: { ...project.career, summary: content as BodyDoc },
                    })
                  }
                />
              </EditorSection>
              <CareerEditor
                qualificationsSection={
                  document === "職務経歴書" ? qualificationsSection : undefined
                }
                key={editorKey}
                project={project}
                disabled={editorDisabled}
                editorKey={editorKey}
                onChange={updateProject}
              />
            </div>
          </Accordion>
        </EditorNavigationContext>
      </div>
      <div className="inspector-footer">
        {footer ?? (
          <>
            保存：⌘/Ctrl+S<span>別名保存：⌘/Ctrl+Shift+S</span>
          </>
        )}
      </div>
    </div>
  );
}
