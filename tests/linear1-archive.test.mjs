import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { root } from './helpers.mjs';
import { findLeaks } from '../tools/check-source-leaks.mjs';
const dir = path.join(root, 'linear1-archive');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'questions.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(dir, 'import-report.json'), 'utf8'));

test('all 47 supplied forms and 389 question sections have intact associations', () => {
  assert.equal(data.exams.length, 47);
  assert.equal(data.questions.length, 389);
  assert.equal(new Set(data.questions.map(q => q.id)).size, 389);
  assert.equal(data.exams.filter(e => e.is_maman).length, 15);
  for (const e of data.exams) assert.equal(data.questions.filter(q => q.exam_id === e.id).length, e.question_count, e.id);
  for (const q of data.questions) {
    assert.ok(data.exams.some(e => e.id === q.exam_id), q.id);
    assert.ok(q.prompt_images.length, q.id);
    for (const id of q.unit_ids) assert.ok(data.units.some(u => u.id === id), id);
  }
});

test('every question and solution image matches its imported source hash and published copy', () => {
  const files = new Map(report.images.map(i => [i.path, i]));
  assert.equal(report.imageReferences, 1056);
  assert.equal(files.size, 965);
  for (const q of data.questions) for (const name of [...q.prompt_images, ...q.solution_images]) {
    assert.match(name, /^images\/[a-f0-9]{64}\.png$/);
    assert.ok(files.has(name), name);
    assert.ok(data.imageSizes[name].every(n => n > 0));
  }
  for (const [name, item] of files) {
    const file = fs.readFileSync(path.join(dir, name));
    assert.equal(crypto.createHash('sha256').update(file).digest('hex'), item.sha256);
    assert.deepEqual(file, fs.readFileSync(path.join(root, 'docs/linear1/assets/archive', name)));
  }
});

test('missing solutions and answer keys are represented without invented answers', () => {
  const missing = data.questions.filter(q => !q.solution_images.length);
  assert.equal(missing.length, 33);
  assert.deepEqual([...new Set(missing.map(q => q.exam_id))].sort(), report.missingSolutionAssignments);
  assert.ok(missing.every(q => !q.solution && !q.answer));
  assert.equal(data.questions.filter(q => q.solution_note?.includes('מפתח תשובות')).length, 18);
  assert.equal(report.invalidPdfFiles.length, 89);
});

test('image allowlist rejects altered crops and still rejects source-book images', () => {
  const item = report.images[0];
  const file = path.join(dir, item.path);
  assert.equal(findLeaks([file], { forbidImages: true }).length, 1);
  assert.equal(findLeaks([file], { forbidImages: true, imageAllowlist: new Map([[file, item.sha256]]) }).length, 0);
  assert.equal(findLeaks([file], { forbidImages: true, imageAllowlist: new Map([[file, 'wrong']]) }).length, 1);
  const sourceDir = path.join(root, 'tmp/archive-leak-fixture');
  fs.mkdirSync(sourceDir, { recursive: true });
  try {
    fs.copyFileSync(file, path.join(sourceDir, 'p001.png'));
    assert.match(findLeaks([file], { sourceDir, forbidImages: true, imageAllowlist: new Map([[file, item.sha256]]) })[0], /page image from the source/);
  } finally { fs.rmSync(sourceDir, { recursive: true, force: true }); }
});
