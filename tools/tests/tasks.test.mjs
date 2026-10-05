import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';

const context = {};
runInNewContext(readFileSync(new URL('../dashboard/tasks.js', import.meta.url), 'utf8'), context);
const { parseTasks, selectTasks } = context.TaskLedger;
const source = readFileSync(new URL('../../tasks/tasks.jsonl', import.meta.url), 'utf8');
const tasks = parseTasks(source);
const encode = items => items.map(item => JSON.stringify(item)).join('\n');
test('実台帳のID・依存・状態・必須項目が整合する', () => {
  assert.ok(tasks.length > 0);
});
test('未完了依存の着手と完了、証跡のない完了を拒否する', () => {
  const base = tasks.slice(0, 2).map(task => ({ ...task, status: 'todo', evidence: [] }));
  assert.throws(() => parseTasks(encode([{ ...base[0], status: 'done' }])));
  assert.throws(() => parseTasks(encode([base[0], { ...base[1], status: 'in_progress' }])));
  assert.throws(() => parseTasks(encode([base[0], { ...base[1], status: 'done', evidence: ['検証成功'] }])));
  assert.equal(parseTasks(encode([{ ...base[0], status: 'done', evidence: ['検証成功'] }, { ...base[1], status: 'in_progress' }])).length, 2);
});
test('不正JSON・重複・依存欠落・循環・日付・ブロック理由を拒否する', () => {
  const task = { ...tasks[0], status: 'todo', dependsOn: [] };
  for (const source of ['{', '', encode([task, task]), encode([{ ...task, dependsOn: ['missing'] }]), encode([{ ...task, dependsOn: [task.id] }]), encode([{ ...task, updatedAt: '2026-02-30' }]), encode([{ ...task, status: 'blocked', blocker: null }])]) assert.throws(() => parseTasks(source));
});
test('検索と状態・マイルストーンを組み合わせる', () => {
  const task = tasks[0];
  assert.equal(selectTasks(tasks, { milestone: task.milestone, status: task.status, query: task.id.toLowerCase() })[0].id, task.id);
  assert.equal(selectTasks(tasks, { query: '存在しない検索文字列' }).length, 0);
});

test('画面が台帳を読み込み、絞り込み、不正な再読込で前回データを維持する', async () => {
  class Element {
    constructor() { this.children = []; this.value = ''; this.listeners = {}; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    get options() { return this.children; }
    setAttribute() {}
    addEventListener(event, callback) { this.listeners[event] = callback; }
  }
  const elements = new Map();
  let response = source;
  const browser = {
    document: { getElementById: id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement: () => new Element() },
    Option: class extends Element { constructor(text, value) { super(); this.textContent = text; this.value = value; } },
    location: { protocol: 'http:' },
    fetch: async () => ({ ok: true, text: async () => response }),
  };
  runInNewContext(readFileSync(new URL('../dashboard/tasks.js', import.meta.url), 'utf8'), browser);
  runInNewContext(readFileSync(new URL('../dashboard/app.js', import.meta.url), 'utf8'), browser);
  await setImmediate();
  assert.equal(elements.get('tasks').children.length, tasks.length);
  elements.get('query').value = tasks[0].title;
  elements.get('query').listeners.input();
  assert.equal(elements.get('tasks').children.length, 1);
  response = '{';
  await elements.get('reload').listeners.click();
  assert.match(elements.get('error').textContent, /前回/);
  assert.equal(elements.get('tasks').children.length, 1);
  elements.get('query').value = '';
  await elements.get('file').listeners.change({ target: { files: [{ name: 'tasks.jsonl', text: async () => source }] } });
  assert.equal(elements.get('tasks').children.length, tasks.length);
  assert.equal(elements.get('error').textContent, '');
});
