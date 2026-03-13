/**
 * Extracts keywords from Jira issue text and searches the repo for relevant files/snippets.
 * Search dirs: src, lib, and optionally packages (for monorepos). Override via JIRA_AI_BUG_SEARCH_DIRS (comma-separated).
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./gitContext.js');

const DEFAULT_INCLUDE = ['src', 'lib', 'packages/main/src', 'packages/AMC'];
const DEFAULT_EXT = ['.js', '.vue', '.ts', '.tsx', '.jsx'];
const MAX_FILES = 80;
const MAX_SNIPPET_LEN = 800;
const SNIPPET_MARGIN = 3;

function getIncludeDirs() {
  const env = process.env.JIRA_AI_BUG_SEARCH_DIRS;
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
  return DEFAULT_INCLUDE;
}

function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  const normalized = text
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const words = normalized.split(' ').filter((w) => w.length >= 2);
  const stop = new Set(['the', 'and', 'for', 'this', 'that', 'with', 'from', 'when', 'have', 'has', 'are', 'was', 'were', 'not', 'but', 'can', 'will', 'all', 'any', 'get', 'got', 'see', 'one', 'two', 'error', 'bug', 'issue', 'fix', 'fixed']);
  const uniq = [...new Set(words.filter((w) => !stop.has(w)))];
  return uniq.slice(0, 25);
}

function findSearchableFiles(includeDirs, ext = DEFAULT_EXT) {
  const root = REPO_ROOT;
  const list = [];
  for (const dir of includeDirs) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) continue;
    const walk = (p) => {
      try {
        const entries = fs.readdirSync(p, { withFileTypes: true });
        for (const e of entries) {
          const fullPath = path.join(p, e.name);
          if (e.isDirectory()) {
            if (e.name !== 'node_modules' && e.name !== 'dist' && !e.name.startsWith('.')) walk(fullPath);
          } else if (ext.some((x) => e.name.endsWith(x))) {
            list.push(path.relative(root, fullPath));
            if (list.length >= MAX_FILES * 2) return;
          }
        }
      } catch (_) {}
    };
    walk(full);
    if (list.length >= MAX_FILES * 2) break;
  }
  return list.slice(0, MAX_FILES);
}

function readSnippet(filePath, keyword, margin = SNIPPET_MARGIN) {
  const full = path.join(REPO_ROOT, filePath);
  let content;
  try {
    content = fs.readFileSync(full, 'utf8');
  } catch {
    return null;
  }
  const lines = content.split(/\r?\n/);
  const lower = content.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx === -1) return null;
  const lineIndex = content.slice(0, idx).split(/\r?\n/).length - 1;
  const start = Math.max(0, lineIndex - margin);
  const end = Math.min(lines.length, lineIndex + margin + 1);
  const snippet = lines.slice(start, end).join('\n');
  return snippet.length > MAX_SNIPPET_LEN ? snippet.slice(0, MAX_SNIPPET_LEN) + '...' : snippet;
}

function searchRepo(issueText, options = {}) {
  const includeDirs = options.includeDirs || getIncludeDirs();
  const keywords = extractKeywords(issueText);
  const files = findSearchableFiles(includeDirs, options.ext || DEFAULT_EXT);
  const results = [];

  for (const relPath of files) {
    const full = path.join(REPO_ROOT, relPath);
    let content;
    try {
      content = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const lower = content.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        const snippet = readSnippet(relPath, kw);
        if (snippet) {
          results.push({ file: relPath, keyword: kw, snippet });
          break;
        }
      }
    }
  }

  return results.slice(0, 40);
}

function formatSearchResultsForPrompt(results) {
  if (!results.length) return 'No matching code snippets found.';
  return results
    .map((r) => `File: ${r.file}\nKeyword: ${r.keyword}\n\`\`\`\n${r.snippet}\n\`\`\``)
    .join('\n\n');
}

module.exports = {
  extractKeywords,
  findSearchableFiles,
  searchRepo,
  formatSearchResultsForPrompt,
};
