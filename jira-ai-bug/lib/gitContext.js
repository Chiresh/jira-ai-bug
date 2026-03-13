/**
 * Collects current branch name, uncommitted diff, and changed files.
 * REPO_ROOT = project where the CLI was run (cwd), set by bin/cli.js.
 */

const { execSync } = require('child_process');
const path = require('path');

const REPO_ROOT = process.env.JIRA_AI_BUG_CWD || process.cwd();

function runGit(args, cwd = REPO_ROOT) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', cwd, maxBuffer: 10 * 1024 * 1024 }).trim();
  } catch (e) {
    return '';
  }
}

function getCurrentBranch() {
  return runGit('rev-parse --abbrev-ref HEAD') || 'HEAD';
}

function getDiffAgainst(base = 'HEAD') {
  return runGit(`diff ${base} --no-color`);
}

function getStagedDiff() {
  return runGit('diff --cached --no-color');
}

function getUnstagedDiff() {
  return runGit('diff --no-color');
}

function getChangedFileNames() {
  const out = runGit('diff --name-only HEAD');
  if (!out) return [];
  return out.split(/\r?\n/).filter(Boolean);
}

function collectDiffContext() {
  const branch = getCurrentBranch();
  const diff = getDiffAgainst('HEAD');
  return {
    branch,
    diff: diff || '(no local changes)',
    changedFiles: getChangedFileNames(),
  };
}

module.exports = {
  REPO_ROOT,
  getCurrentBranch,
  getDiffAgainst,
  getStagedDiff,
  getUnstagedDiff,
  getChangedFileNames,
  collectDiffContext,
};
