'use strict';
// Python stack detector: uv / poetry / pip, ruff, mypy, pytest.
const path = require('path');
const { exists, readText } = require('../fs');

const MARKERS = ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'pytest.ini', 'tox.ini'];

function detectPython(root) {
  if (!MARKERS.some((f) => exists(path.join(root, f)))) return null;
  const has = (f) => exists(path.join(root, f));
  const pyproject = readText(path.join(root, 'pyproject.toml')) || '';
  const requirements = readText(path.join(root, 'requirements.txt')) || '';

  let packageManager = 'pip';
  if (has('uv.lock')) packageManager = 'uv';
  else if (has('poetry.lock') || /\[tool\.poetry\]/.test(pyproject)) packageManager = 'poetry';
  const p = packageManager === 'pip' ? '' : `${packageManager} run `;

  const ruff = has('ruff.toml') || has('.ruff.toml') || /ruff/i.test(pyproject);
  const mypy = has('mypy.ini') || /\[tool\.mypy\]/.test(pyproject);
  const pytest = has('pytest.ini') || has('tests') || has('test') || has('conftest.py') ||
    /pytest/i.test(pyproject) || /pytest/i.test(requirements);

  const checks = [];
  if (ruff) checks.push(`${p}ruff check .`);
  if (mypy) checks.push(`${p}mypy .`);
  if (pytest) checks.push(`${p}pytest -q`);

  return {
    kind: 'python',
    packageManager,
    typescript: false,
    eslint: false,
    workspaces: false,
    scripts: [],
    checks,
    testGlobs: ['**/test_*.py', '**/*_test.py', '**/tests/**', '**/conftest.py'],
    lint: ruff ? { cmd: `${p}ruff check`, exts: ['.py'] } : null,
    notes: [],
  };
}

module.exports = { detectPython };
