'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpProject } = require('./helpers');
const skills = require('../lib/adopt/skills');
const commands = require('../lib/adopt/commands');
const toolmap = require('../lib/adopt/toolmap');
const { frontmatter } = require('../lib/fs');

const ctx = () => ({ home: tmpProject({}), toolmap, registry: require('../lib/registry.json') });

test('skills: copies the directory, rewrites SKILL.md, drops Claude-only frontmatter', () => {
  const root = tmpProject({
    '.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: Deploy to prod\nallowed-tools: Bash\ndisable-model-invocation: true\n---\n# Deploy\nRun `Bash` script.\n',
    '.claude/skills/deploy/scripts/go.sh': '#!/bin/sh\necho hi\n',
    '.claude/skills/deploy/references/notes.md': 'Read the notes\n',
  });
  const [it] = skills.scan(root, ctx());
  assert.equal(it.kind, 'skill');
  assert.equal(it.target, '.agents/skills/deploy/SKILL.md');
  const fm = frontmatter(it.content);
  assert.deepEqual(fm, { name: 'deploy', description: 'Deploy to prod' });
  assert.match(it.content, /Run `run_command` script/);
  assert.equal(it.status, 'auto');
  assert.match(it.reason, /dropped frontmatter allowed-tools, disable-model-invocation/);
  assert.deepEqual(it.files.map((f) => f.target), ['.agents/skills/deploy/references/notes.md', '.agents/skills/deploy/scripts/go.sh']);
  assert.ok(Buffer.isBuffer(it.files[1].content));
  assert.match(it.files[0].sourceHash, /^sha256:/);
  assert.deepEqual(it.files[0].content, Buffer.from('Read the notes\n'));
  assert.deepEqual(it.files[1].content, Buffer.from('#!/bin/sh\necho hi\n'));
});

test('skills: bad name, hx clash, missing description, leftovers → manual', () => {
  const root = tmpProject({
    '.claude/skills/Bad_Name/SKILL.md': '---\nname: Bad_Name\ndescription: x\n---\nbody\n',
    '.claude/skills/verify/SKILL.md': '---\nname: verify\ndescription: x\n---\nbody\n',
    '.claude/skills/nodesc/SKILL.md': '---\nname: nodesc\n---\nbody\n',
    '.claude/skills/left/SKILL.md': '---\nname: left\ndescription: x\n---\nUse the NotebookEdit tool\n',
    '.claude/skills/noskillmd/README.md': 'ignored\n',
  });
  const items = skills.scan(root, ctx());
  assert.deepEqual(items.map((i) => i.source).sort(), ['.claude/skills/Bad_Name/SKILL.md', '.claude/skills/left/SKILL.md', '.claude/skills/nodesc/SKILL.md', '.claude/skills/verify/SKILL.md']);
  for (const it of items) assert.equal(it.status, 'manual', it.source);
  assert.match(items.find((i) => /verify/.test(i.source)).reason, /shadows \/hx-\*:verify/);
  assert.match(items.find((i) => /Bad_Name/.test(i.source)).reason, /name must match/);
  assert.match(items.find((i) => /nodesc/.test(i.source)).reason, /description is required/);
  assert.equal(items.find((i) => /left/.test(i.source)).leftovers.length, 1);
});

test('skills: frontmatter name differs from directory → renamed in reason', () => {
  const root = tmpProject({
    '.claude/skills/deploy2/SKILL.md': '---\nname: Deploy_Two\ndescription: Deploy v2\n---\nbody\n',
  });
  const [it] = skills.scan(root, ctx());
  const fm = frontmatter(it.content);
  assert.equal(fm.name, 'deploy2');
  assert.match(it.reason, /renamed frontmatter name "Deploy_Two" -> "deploy2"/);
});

test('commands: nested files become skills; description from frontmatter or first line; $ARGUMENTS noted', () => {
  const root = tmpProject({
    '.claude/commands/review.md': '---\ndescription: Review the diff\n---\nReview `git diff` with the Read tool. Args: $ARGUMENTS\n',
    '.claude/commands/db/migrate.md': '# Migrate\nRun the migration for $1.\n',
  });
  const items = commands.scan(root, ctx());
  const review = items.find((i) => i.source === '.claude/commands/review.md');
  assert.equal(review.kind, 'command');
  assert.equal(review.target, '.agents/skills/review/SKILL.md');
  assert.deepEqual(frontmatter(review.content), { name: 'review', description: 'Review the diff' });
  assert.match(review.content, /with `view_file`/);
  assert.match(review.reason, /\$ARGUMENTS/);
  const migrate = items.find((i) => i.source === '.claude/commands/db/migrate.md');
  assert.equal(migrate.target, '.agents/skills/db-migrate/SKILL.md');
  assert.equal(frontmatter(migrate.content).description, 'Migrate');
});

test('commands: empty description → manual', () => {
  const root = tmpProject({
    '.claude/commands/empty.md': '   \n\n  \n',
  });
  const [it] = commands.scan(root, ctx());
  assert.equal(it.status, 'manual');
  assert.match(it.reason, /description is required/);
});

test('commands: a same-named .claude/skills entry wins', () => {
  const root = tmpProject({
    '.claude/commands/deploy.md': 'Deploy it\n',
    '.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: d\n---\nx\n',
  });
  const [it] = commands.scan(root, ctx());
  assert.equal(it.status, 'unsupported');
  assert.equal(it.content, null);
  assert.match(it.reason, /skills win/);
});
