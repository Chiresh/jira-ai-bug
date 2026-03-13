/**
 * Assembles prompt from Jira + repo snippets + git diff, calls OpenAI-compatible API, returns structured analysis.
 */

const https = require('https');
const http = require('http');

function getEnv(name) {
  const val = process.env[name];
  if (val === undefined || val === '') return null;
  return String(val).trim();
}

function buildPrompt(issue, codeSnippetsText, diffContext) {
  const parts = [
    'You are a senior engineer analyzing a Jira Bug. Use only the information below.',
    '',
    '## Jira Bug',
    `Key: ${issue.key}`,
    `Summary: ${issue.summary}`,
    `Status: ${issue.status}`,
    '',
    'Description:',
    issue.description || '(none)',
    '',
    'Comments:',
    issue.comments.length
      ? issue.comments.map((c) => `- ${c.author}: ${c.body}`).join('\n')
      : '(none)',
    '',
    '## Relevant code snippets from the repo (keyword search)',
    codeSnippetsText,
    '',
    '## Current git context',
    `Branch: ${diffContext.branch}`,
    'Diff (vs HEAD):',
    diffContext.diff,
    '',
    'Respond in the following JSON shape only, no markdown or extra text:',
    JSON.stringify({
      rootCauseSummary: '1-3 sentences on the likely root cause.',
      possibleFixes: ['Fix 1', 'Fix 2'],
      riskNotes: 'Short note on risks or side effects.',
      suspectedFiles: ['path/to/file1.js', 'path/to/file2.vue'],
    }),
  ];
  return parts.join('\n');
}

function callChatApi(body) {
  const baseUrl = getEnv('AI_BASE_URL') || 'https://api.openai.com';
  const apiKey = getEnv('AI_API_KEY');
  const model = getEnv('AI_MODEL') || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('Missing AI_API_KEY. Set it in project .env (see .env.example).');
  }

  const base = baseUrl.replace(/\/$/, '');
  const pathSuffix = base.includes('/v1') ? '/chat/completions' : '/v1/chat/completions';
  const url = new URL(pathSuffix, base);
  const postData = JSON.stringify({
    model,
    messages: [{ role: 'user', content: body }],
    max_tokens: 1500,
    temperature: 0.2,
  });

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(data || `HTTP ${res.statusCode}`));
            return;
          }
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.message?.content;
            if (!content) reject(new Error('No content in AI response'));
            else resolve(content.trim());
          } catch (e) {
            reject(new Error('Invalid AI response JSON'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function parseStructuredResponse(text) {
  const trimmed = text.replace(/^```json?\s*|\s*```$/g, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return {
      rootCauseSummary: text.slice(0, 500),
      possibleFixes: [],
      riskNotes: '',
      suspectedFiles: [],
    };
  }
}

async function analyze(issue, codeSnippetsText, diffContext) {
  const prompt = buildPrompt(issue, codeSnippetsText, diffContext);
  const raw = await callChatApi(prompt);
  return parseStructuredResponse(raw);
}

module.exports = {
  buildPrompt,
  analyze,
  parseStructuredResponse,
};
