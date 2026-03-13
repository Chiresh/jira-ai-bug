/**
 * Jira Cloud REST API client. Fetches issue by key and validates Bug type.
 */

const https = require('https');
const http = require('http');

const BUG_ISSUE_TYPE_NAMES = ['Bug', 'bug', '缺陷'];

function getEnv(name) {
  const val = process.env[name];
  if (val === undefined || val === '') return null;
  return String(val).trim();
}

function fetchIssue(key) {
  const baseUrl = getEnv('JIRA_BASE_URL');
  const email = getEnv('JIRA_EMAIL');
  const token = getEnv('JIRA_API_TOKEN');

  if (!baseUrl || !email || !token) {
    const missing = [];
    if (!baseUrl) missing.push('JIRA_BASE_URL');
    if (!email) missing.push('JIRA_EMAIL');
    if (!token) missing.push('JIRA_API_TOKEN');
    throw new Error(
      `Missing Jira config. Set in project .env: ${missing.join(', ')}. Create JIRA_API_TOKEN at https://id.atlassian.com/manage-profile/security/api-tokens`
    );
  }

  const url = new URL(`${baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(key)}`);
  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${auth}`,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            try {
              const err = JSON.parse(body);
              reject(new Error(err.errorMessages?.join(' ') || body || `HTTP ${res.statusCode}`));
            } catch {
              reject(new Error(body || `HTTP ${res.statusCode}`));
            }
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid Jira response JSON'));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function normalizeIssue(raw) {
  const f = raw.fields || {};
  const issueType = f.issuetype?.name || '';
  const comments = (f.comment?.comments || []).map((c) => ({
    body: (c.body?.content || []).map((b) => (b.content || []).map((t) => t.text).join('')).join(''),
    author: c.author?.displayName,
    created: c.created,
  }));

  let description = '';
  if (f.description?.content) {
    description = f.description.content
      .map((b) => (b.content || []).map((t) => (t && t.text) || '').join(''))
      .join('\n');
  }

  return {
    key: raw.key,
    summary: f.summary || '',
    description,
    issueType,
    status: f.status?.name || '',
    comments,
    isBug: BUG_ISSUE_TYPE_NAMES.includes(issueType),
  };
}

async function getBugIssue(jiraKey) {
  const raw = await fetchIssue(jiraKey);
  const issue = normalizeIssue(raw);
  if (!issue.isBug) {
    throw new Error(`Issue ${issue.key} is not a Bug (type: ${issue.issueType}). This tool only analyzes Bug issues.`);
  }
  return issue;
}

module.exports = {
  getBugIssue,
  fetchIssue,
  normalizeIssue,
};
