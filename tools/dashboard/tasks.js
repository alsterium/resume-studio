(() => {
const labels = { todo: '未着手', in_progress: '進行中', blocked: 'ブロック', done: '完了' };

function parseTasks(source) {
  const tasks = source.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    let task;
    try { task = JSON.parse(line); } catch { throw new Error(`${index + 1}件目: JSONが不正です`); }
    if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('タスクはオブジェクトにしてください');
    for (const key of ['id', 'title', 'milestone', 'acceptance', 'updatedAt']) {
      if (typeof task[key] !== 'string' || !task[key].trim()) throw new Error(`${key}は必須です`);
    }
    if (!Object.hasOwn(labels, task.status)) throw new Error(`${task.id}: 状態が不正です`);
    for (const key of ['dependsOn', 'evidence']) {
      if (!Array.isArray(task[key]) || task[key].some(value => typeof value !== 'string' || !value.trim())) throw new Error(`${task.id}: ${key}が不正です`);
    }
    if (task.owner !== null && typeof task.owner !== 'string') throw new Error(`${task.id}: ownerが不正です`);
    if (task.blocker !== null && typeof task.blocker !== 'string') throw new Error(`${task.id}: blockerが不正です`);
    if (task.status === 'done' && !task.evidence.length) throw new Error(`${task.id}: 完了には検証証跡が必要です`);
    if (task.status === 'blocked' && !task.blocker?.trim()) throw new Error(`${task.id}: ブロック理由が必要です`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(task.updatedAt) || Number.isNaN(Date.parse(task.updatedAt)) || new Date(task.updatedAt).toISOString().slice(0, 10) !== task.updatedAt) throw new Error(`${task.id}: 日付が不正です`);
    return task;
  });
  if (!tasks.length) throw new Error('タスクがありません');
  const ids = new Set(tasks.map(task => task.id));
  if (ids.size !== tasks.length) throw new Error('IDが重複しています');
  const byId = new Map(tasks.map(task => [task.id, task]));
  const visited = new Set(), active = new Set();
  function visit(id) {
    if (active.has(id)) throw new Error('依存関係が循環しています');
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of byId.get(id).dependsOn) {
      if (!ids.has(dependency)) throw new Error(`${id}: 依存先${dependency}がありません`);
      visit(dependency);
    }
    active.delete(id); visited.add(id);
  }
  tasks.forEach(task => visit(task.id));
  for (const task of tasks) {
    if (['in_progress', 'done'].includes(task.status) && task.dependsOn.some(id => byId.get(id).status !== 'done')) throw new Error(`${task.id}: 未完了の依存タスクがあります`);
  }
  return tasks;
}

function selectTasks(tasks, { status = '', milestone = '', query = '' } = {}) {
  const term = query.toLocaleLowerCase();
  return tasks.filter(task => (!status || task.status === status) && (!milestone || task.milestone === milestone) && JSON.stringify(task).toLocaleLowerCase().includes(term));
}

globalThis.TaskLedger = { labels, parseTasks, selectTasks };
})();
