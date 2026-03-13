/**
 * jira-ai-bug: analyze Jira Bug + repo + diff, optional AI; report generates fix doc.
 * Invoked from bin/cli.js with JIRA_AI_BUG_CWD and .env already set.
 */

const path = require('path');
const fs = require('fs');
const { getBugIssue } = require('./jiraClient.js');
const { searchRepo, formatSearchResultsForPrompt } = require('./repoSearch.js');
const { collectDiffContext, REPO_ROOT } = require('./gitContext.js');
const { analyze } = require('./aiAnalyzer.js');
const { writeReport } = require('./reportWriter.js');

const CACHE_DIR = path.join(REPO_ROOT, '.jira-ai-analysis');

function getCommandAndKey() {
  const cmd = process.argv[2];
  let key = process.argv[3];
  const noAi = process.argv[4] === '--no-ai' || process.argv[3] === '--no-ai';
  if (noAi && process.argv[3] === '--no-ai') key = process.argv[4];
  if (cmd !== 'analyze' && cmd !== 'report') {
    console.error('Usage: jira-ai-bug analyze <JIRA-KEY> [--no-ai] | report <JIRA-KEY>');
    console.error('Example: npx jira-ai-bug analyze DSP-1234 --no-ai');
    process.exit(1);
  }
  if (!key || !/^[A-Za-z]+-\d+$/i.test(key)) {
    console.error('Provide a valid Jira key, e.g. DSP-1234');
    process.exit(1);
  }
  return { command: cmd, jiraKey: key.toUpperCase(), noAi };
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function readCachedAnalysis(jiraKey) {
  const file = path.join(CACHE_DIR, `${jiraKey}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeCachedAnalysis(jiraKey, issue, analysis) {
  ensureCacheDir();
  const file = path.join(CACHE_DIR, `${jiraKey}.json`);
  fs.writeFileSync(file, JSON.stringify({ issue, analysis }, null, 2), 'utf8');
}

async function runAnalyze(jiraKey, noAi) {
  console.log(`Fetching Jira issue ${jiraKey}...`);
  const issue = await getBugIssue(jiraKey);
  console.log(`Found Bug: ${issue.summary}`);

  const issueText = [issue.summary, issue.description, ...issue.comments.map((c) => c.body)].join(' ');
  const searchResults = searchRepo(issueText);
  const codeSnippetsText = formatSearchResultsForPrompt(searchResults);
  const diffContext = collectDiffContext();

  const skipAi = noAi || !process.env.AI_API_KEY || !process.env.AI_API_KEY.trim();
  let analysis = {
    rootCauseSummary: '',
    possibleFixes: [],
    riskNotes: '',
    suspectedFiles: [],
  };

  if (skipAi) {
    console.log('Skipping AI (--no-ai or no AI_API_KEY). Outputting context only.\n');
    console.log('--- Jira ---');
    console.log(`Summary: ${issue.summary}`);
    console.log(`Status: ${issue.status}`);
    if (issue.description) console.log(`Description:\n${issue.description}`);
    if (issue.comments.length) {
      console.log('\nComments:');
      issue.comments.forEach((c) => console.log(`  [${c.author}] ${c.body.slice(0, 200)}${c.body.length > 200 ? '...' : ''}`));
    }
    console.log('\n--- Repo search (keyword-related files) ---');
    const files = [...new Set(searchResults.map((r) => r.file))];
    console.log(files.length ? files.join('\n') : '(none)');
    if (codeSnippetsText && codeSnippetsText !== 'No matching code snippets found.') {
      console.log('\n--- Code snippets ---\n' + codeSnippetsText.slice(0, 3000) + (codeSnippetsText.length > 3000 ? '\n...' : ''));
    }
    console.log('\n--- Git ---');
    console.log('Branch: ' + diffContext.branch);
    console.log('Changed files: ' + (diffContext.changedFiles.length ? diffContext.changedFiles.join(', ') : '(none)'));
    if (diffContext.diff && diffContext.diff !== '(no local changes)') {
      console.log('\nDiff (first 2000 chars):\n' + diffContext.diff.slice(0, 2000) + (diffContext.diff.length > 2000 ? '\n...' : ''));
    }
    analysis.suspectedFiles = files;
  } else {
    console.log('Calling AI for root cause and fix suggestions...');
    try {
      analysis = await analyze(issue, codeSnippetsText, diffContext);
    } catch (e) {
      console.error('AI call failed: ' + e.message);
      console.log('Re-run with --no-ai to only output Jira + repo + diff context.');
      throw e;
    }
    console.log('\n--- Root cause ---\n' + (analysis.rootCauseSummary || '(none)'));
    console.log('\n--- Possible fixes ---\n' + (Array.isArray(analysis.possibleFixes) ? analysis.possibleFixes.map((f) => `- ${f}`).join('\n') : analysis.possibleFixes || '(none)'));
    if (analysis.riskNotes) console.log('\n--- Risks ---\n' + analysis.riskNotes);
    console.log('\n--- Suspected files ---\n' + (Array.isArray(analysis.suspectedFiles) ? analysis.suspectedFiles.join('\n') : '(none)'));
  }

  writeCachedAnalysis(jiraKey, issue, analysis);
  console.log('\nCached. Run "jira-ai-bug report ' + jiraKey + '" after fixing to generate the fix doc.');
}

async function runReport(jiraKey) {
  const cached = readCachedAnalysis(jiraKey);
  const diffContext = collectDiffContext();

  let issue;
  let rootCause = '';
  let suggestedFix = '';

  if (cached && cached.issue) {
    issue = cached.issue;
    rootCause = cached.analysis?.rootCauseSummary || '';
    suggestedFix = Array.isArray(cached.analysis?.possibleFixes)
      ? cached.analysis.possibleFixes.join('\n- ')
      : cached.analysis?.possibleFixes || '';
  } else {
    console.log('No cached analysis for ' + jiraKey + '. Fetching issue only; root cause/fix will be empty.');
    issue = await getBugIssue(jiraKey);
  }

  const filePath = writeReport(jiraKey, {
    summary: issue.summary,
    issueType: issue.issueType,
    rootCause,
    suggestedFix,
    changedFiles: diffContext.changedFiles,
  });
  console.log('Report written to ' + filePath);
}

const { command, jiraKey, noAi } = getCommandAndKey();
if (command === 'analyze') {
  runAnalyze(jiraKey, noAi).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
} else {
  runReport(jiraKey).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
