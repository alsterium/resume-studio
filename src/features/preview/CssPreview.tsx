import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BlockNode, BodyDoc, Contact, HistoryRow, Project } from "../../domain/project";
import { ageOnDate, effectiveDocumentDate } from "../../domain/dates";
import { useLocalDate } from "../../components/useLocalDate";

function Blocks({ nodes }: { nodes: BlockNode[] }) {
  return nodes.map((node, index) => {
    if (node.type === "paragraph")
      return (
        <p key={index}>
          {node.content?.map((inline, position) => {
            if (inline.type === "hardBreak") return <br key={position} />;
            let text: ReactNode = inline.text;
            for (const mark of inline.marks ?? [])
              text = mark.type === "bold" ? <strong>{text}</strong> : <em>{text}</em>;
            return <span key={position}>{text}</span>;
          })}
        </p>
      );
    const items = node.content.map((item, position) => (
      <li key={position}>
        <Blocks nodes={item.content} />
      </li>
    ));
    return node.type === "orderedList" ? (
      <ol key={index} start={node.attrs?.start ?? 1}>
        {items}
      </ol>
    ) : (
      <ul key={index}>{items}</ul>
    );
  });
}
function Body({ value }: { value: BodyDoc }) {
  return (
    <div className="paper-body">
      <Blocks nodes={value.content ?? []} />
    </div>
  );
}
function hasBody(value: BodyDoc): boolean {
  return JSON.stringify(value).includes('"text"');
}
function dateLabel(value: string) {
  const parts = value.split("-");
  return value
    ? `${parts[0]}年${Number(parts[1])}月${parts[2] ? `${Number(parts[2])}日` : ""}`
    : "";
}
function period(start: string, end: string | null) {
  return `${dateLabel(start)}${start || end !== "" ? " ～ " : ""}${end === null ? "現在" : dateLabel(end)}`;
}
function History({ title, rows }: { title: string; rows: HistoryRow[] }) {
  return (
    <table className="paper-history">
      <thead>
        <tr>
          <th>年</th>
          <th>月</th>
          <th>{title}</th>
        </tr>
      </thead>
      <tbody>
        {(rows.length ? rows : [{ id: "empty", yearMonth: "", text: "" }]).map((row) => (
          <tr key={row.id}>
            <td>{row.yearMonth.split("-")[0]}</td>
            <td>{row.yearMonth ? Number(row.yearMonth.split("-")[1]) : ""}</td>
            <td>{row.text || "\u00a0"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function ContactBlock({ label, contact }: { label: string; contact: Contact }) {
  return (
    <div className="paper-contact">
      <div>
        <small>ふりがな</small> {contact.addressKana}
      </div>
      <div>
        <small>{label}</small> {contact.postalCode && `〒${contact.postalCode}`}
        <p>{contact.address || "\u00a0"}</p>
      </div>
      <div>
        <small>電話</small> {contact.phone}
        <br />
        <small>Email</small> {contact.email}
      </div>
    </div>
  );
}
function Paper({ scale, children }: { scale: number; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(1123);
  useEffect(() => {
    const sheet = ref.current!;
    const update = () => setHeight(sheet.offsetHeight);
    const observer = new ResizeObserver(update);
    observer.observe(sheet);
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <div className="css-paper-frame" style={{ width: 794 * scale, height: height * scale }}>
      <article className="css-paper" ref={ref} style={{ transform: `scale(${scale})` }}>
        {children}
      </article>
    </div>
  );
}
function PaperSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="paper-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function CssPreview({ project, kind }: { project: Project; kind: "resume" | "career" }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.45);
  const today = useLocalDate();
  const date = effectiveDocumentDate(project, today);
  const profile = project.profile;
  const age = ageOnDate(profile.birthDate, date);
  const photo = project.assets.find((asset) => asset.id === profile.photoAssetId);
  useEffect(() => {
    const element = viewport.current!;
    const update = () => setScale(Math.max(0.1, Math.min(1, (element.clientWidth - 32) / 794)));
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <div className="css-preview" ref={viewport} aria-label="簡易書類プレビュー">
      {kind === "resume" ? (
        <>
          <Paper scale={scale}>
            <div className="paper-title">
              <h2>履歴書</h2>
              <span>{dateLabel(date)}現在</span>
            </div>
            <div className="paper-profile">
              <div className="paper-name">
                <small>ふりがな</small>
                <div>{profile.nameKana || "\u00a0"}</div>
                <small>氏名</small>
                <p>{profile.name || "\u00a0"}</p>
              </div>
              <div className="paper-photo">
                {photo ? (
                  <img
                    src={`data:${photo.mediaType};base64,${photo.base64}`}
                    alt="証明写真のプレビュー"
                  />
                ) : (
                  <span>写真</span>
                )}
              </div>
              <div className="paper-birth">
                {dateLabel(profile.birthDate)} {profile.birthDate && "生"}{" "}
                {age !== null && `（満${age}歳）`}
                <span>{profile.genderLabel}</span>
              </div>
            </div>
            <ContactBlock label="現住所" contact={profile} />
            {profile.alternateContact && (
              <ContactBlock label="連絡先" contact={profile.alternateContact} />
            )}
            <History title="学歴" rows={project.resume.education} />
            <History title="職歴" rows={project.resume.employment} />
          </Paper>
          <Paper scale={scale}>
            <History title="免許・資格" rows={project.resume.qualifications} />
            <div className="paper-resume-box">
              <h3>志望動機</h3>
              <Body value={project.resume.motivation} />
            </div>
            <div className="paper-resume-box">
              <h3>本人希望記入欄</h3>
              <Body value={project.resume.preferences} />
            </div>
          </Paper>
        </>
      ) : (
        <Paper scale={scale}>
          <div className="paper-title career-paper-title">
            <h2>職務経歴書</h2>
          </div>
          <div className="paper-career-meta">
            {dateLabel(date)}現在
            <br />
            {profile.name}
          </div>
          {hasBody(project.career.summary) && (
            <PaperSection title="職務要約">
              <Body value={project.career.summary} />
            </PaperSection>
          )}
          {project.career.skills.length > 0 && (
            <PaperSection title="スキル">
              <table className="paper-skills">
                <tbody>
                  {project.career.skills.map((skill) => (
                    <tr key={skill.id}>
                      <th>
                        {skill.name}
                        <small>
                          {/^[0-9０-９]+$/u.test(skill.experienceLabel.trim())
                            ? `${skill.experienceLabel.trim()}年以上`
                            : skill.experienceLabel}
                        </small>
                      </th>
                      <td>{skill.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PaperSection>
          )}
          {project.career.qualifications.length > 0 && (
            <PaperSection title="免許・資格">
              <table className="paper-skills">
                <tbody>
                  {project.career.qualifications.map((row) => (
                    <tr key={row.id}>
                      <th>{row.text}</th>
                      <td>{dateLabel(row.yearMonth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PaperSection>
          )}
          {project.career.positions.length > 0 && (
            <PaperSection title="職務経歴">
              {project.career.positions.map((position) => (
                <section className="paper-position" key={position.id}>
                  <h4>{position.companyName}</h4>
                  <div>{period(position.startYearMonth, position.endYearMonth)}</div>
                  {position.role && <p>役職：{position.role}</p>}
                  {position.companyOverview?.business && (
                    <p>事業内容：{position.companyOverview.business}</p>
                  )}
                  {position.companyOverview?.capital && (
                    <p>資本金：{position.companyOverview.capital}</p>
                  )}
                  {position.companyOverview?.employees && (
                    <p>従業員数：{position.companyOverview.employees}</p>
                  )}
                  {position.projects.map((item) => (
                    <div className="paper-project" key={item.id}>
                      <h5>{item.name}</h5>
                      <div>{period(item.startYearMonth, item.endYearMonth)}</div>
                      {hasBody(item.overview) && (
                        <>
                          <h6>案件概要</h6>
                          <Body value={item.overview} />
                        </>
                      )}
                      {item.phases.length > 0 && <p>担当フェーズ：{item.phases.join("、")}</p>}
                      {hasBody(item.responsibilities) && (
                        <>
                          <h6>担当業務</h6>
                          <Body value={item.responsibilities} />
                        </>
                      )}
                      {hasBody(item.achievements) && (
                        <>
                          <h6>実績</h6>
                          <Body value={item.achievements} />
                        </>
                      )}
                      {item.teamSize && <p>チーム規模：{item.teamSize}</p>}
                      {item.languages.length > 0 && <p>使用言語：{item.languages.join("、")}</p>}
                      {item.technologies.length > 0 && (
                        <p>使用技術：{item.technologies.join("、")}</p>
                      )}
                      {item.url && <p>URL：{item.url}</p>}
                    </div>
                  ))}
                </section>
              ))}
            </PaperSection>
          )}
          {project.career.researches?.some(
            (item) =>
              item.name ||
              hasBody(item.overview) ||
              hasBody(item.contents) ||
              hasBody(item.achievements) ||
              item.languages.length ||
              item.technologies.length,
          ) && (
            <PaperSection title="学生時代の研究">
              {project.career.researches
                .filter(
                  (item) =>
                    item.name ||
                    hasBody(item.overview) ||
                    hasBody(item.contents) ||
                    hasBody(item.achievements) ||
                    item.languages.length ||
                    item.technologies.length,
                )
                .map((item) => (
                  <div className="paper-project" key={item.id}>
                    {item.name && <h4>{item.name}</h4>}
                    {hasBody(item.overview) && (
                      <>
                        <h6>研究概要</h6>
                        <Body value={item.overview} />
                      </>
                    )}
                    {hasBody(item.contents) && (
                      <>
                        <h6>研究内容</h6>
                        <Body value={item.contents} />
                      </>
                    )}
                    {hasBody(item.achievements) && (
                      <>
                        <h6>実績</h6>
                        <Body value={item.achievements} />
                      </>
                    )}
                    {item.languages.length > 0 && <p>使用言語：{item.languages.join("、")}</p>}
                    {item.technologies.length > 0 && (
                      <p>使用技術：{item.technologies.join("、")}</p>
                    )}
                  </div>
                ))}
            </PaperSection>
          )}
          {hasBody(project.career.selfPromotion) && (
            <PaperSection title="自己PR">
              <Body value={project.career.selfPromotion} />
            </PaperSection>
          )}
        </Paper>
      )}
    </div>
  );
}
