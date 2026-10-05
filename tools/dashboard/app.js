const { labels, parseTasks, selectTasks } = globalThis.TaskLedger;
const el = id => document.getElementById(id);
let tasks = [], generation = 0;
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function metric(title, value) {
  const element = node('div', undefined, 'metric');
  element.append(node('span', title), node('strong', value));
  return element;
}
function render() {
  const done = tasks.filter(task => task.status === 'done').length;
  el('summary').replaceChildren(metric('完了率（件数ベース）', `${Math.round(done / tasks.length * 100)}%`), ...Object.entries(labels).map(([status, label]) => metric(label, tasks.filter(task => task.status === status).length)));
  el('milestones').replaceChildren(...[...new Set(tasks.map(task => task.milestone))].map(milestone => {
    const group = tasks.filter(task => task.milestone === milestone);
    const count = group.filter(task => task.status === 'done').length;
    const element = metric(milestone, `${count} / ${group.length}`);
    const progress = node('progress'); progress.max = group.length; progress.value = count;
    progress.setAttribute('aria-label', `${milestone} 完了数`); element.append(progress); return element;
  }));
  const selected = selectTasks(tasks, { status: el('status').value, milestone: el('milestone').value, query: el('query').value });
  el('count').textContent = `${selected.length} / ${tasks.length} 件`;
  el('tasks').replaceChildren(...selected.map(task => {
    const card = node('article');
    card.append(node('h2', `${task.id} ${task.title}`), node('p', `${task.milestone} · ${labels[task.status]} · 担当: ${task.owner || '未割当'} · 更新: ${task.updatedAt}`, 'meta'), node('p', task.acceptance));
    const dependencies = task.dependsOn.map(id => `${id}（${labels[tasks.find(item => item.id === id).status]}）`).join('、');
    card.append(node('p', `依存: ${dependencies || 'なし'}`, 'meta'));
    if (task.blocker) card.append(node('p', `ブロック理由: ${task.blocker}`));
    if (task.evidence.length) {
      const details = node('details'); details.append(node('summary', '検証証跡'));
      const list = node('ul'); task.evidence.forEach(item => list.append(node('li', item))); details.append(list); card.append(details);
    }
    return card;
  }));
}
function accept(source, name) {
  const parsed = parseTasks(source);
  tasks = parsed;
  const selection = el('milestone').value;
  el('milestone').replaceChildren(new Option('すべて', ''), ...[...new Set(tasks.map(task => task.milestone))].map(value => new Option(value, value)));
  el('milestone').value = [...el('milestone').options].some(option => option.value === selection) ? selection : '';
  el('source').textContent = `${name} · 読込時刻 ${new Date().toLocaleString('ja-JP')}`;
  el('error').textContent = ''; render();
}
function failure(error) {
  el('error').textContent = `${error.message}\n${tasks.length ? '前回読み込んだデータを表示しています。' : 'HTTPサーバーで開くか、JSONLファイルを選択してください。'}`;
}
async function reload() {
  const request = ++generation;
  try {
    if (location.protocol === 'file:') throw new Error('直接開いた場合はJSONLファイルを選択してください。');
    const response = await fetch('../../tasks/tasks.jsonl', { cache: 'no-store' });
    if (!response.ok) throw new Error(`台帳の読み込みに失敗 (${response.status})`);
    const source = await response.text();
    if (request === generation) accept(source, 'tasks/tasks.jsonl');
  } catch (error) { if (request === generation) failure(error); }
}
el('reload').addEventListener('click', reload);
el('file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const request = ++generation;
  try { const source = await file.text(); if (request === generation) accept(source, file.name); }
  catch (error) { if (request === generation) failure(error); }
});
['status', 'milestone', 'query'].forEach(id => el(id).addEventListener('input', () => { if (tasks.length) render(); }));
reload();
