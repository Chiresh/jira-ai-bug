/**
 * Writes a fix report Markdown to docs/jira-fixes/<KEY>-fix.md in the project root.
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./gitContext.js');

const OUTPUT_DIR = path.join(REPO_ROOT, 'docs', 'jira-fixes');
// Expose for writeCursorPromptFile in index.js

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildReportMd(options) {
  const {
    jiraKey,
    summary,
    issueType = 'Bug',
    rootCause = '',
    suggestedFix = '',
    changedFiles = [],
    verification = '',
  } = options;

  const lines = [
    `# ${jiraKey} Fix Report`,
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| **Jira** | ${jiraKey}: ${summary || '(no summary)'} |`,
    `| **Issue Type** | ${issueType} |`,
    '',
    '## Root Cause',
    '',
    rootCause || '(not filled)',
    '',
    '## Suggested Fix',
    '',
    suggestedFix || '(not filled)',
    '',
    '## Changed Files',
    '',
  ];

  if (changedFiles.length) {
    lines.push(changedFiles.map((f) => `- \`${f}\``).join('\n'));
  } else {
    lines.push('(none collected)');
  }

  lines.push('', '## Verification', '', verification || '(manual verification)');

  return lines.join('\n');
}

function writeReport(jiraKey, options) {
  ensureDir(OUTPUT_DIR);
  const safeKey = jiraKey.replace(/[^A-Za-z0-9-]/g, '');
  const filename = `${safeKey}-fix.md`;
  const filePath = path.join(OUTPUT_DIR, filename);
  const content = buildReportMd({ jiraKey, ...options });
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

module.exports = {
  OUTPUT_DIR,
  buildReportMd,
  writeReport,
};
