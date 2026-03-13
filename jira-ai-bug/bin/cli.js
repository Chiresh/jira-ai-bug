#!/usr/bin/env node
/**
 * CLI entry when installed via npm/pnpm. Runs in the project that invoked it (cwd = project root).
 */
const path = require('path');
const fs = require('fs');

const cwd = process.cwd();
process.env.JIRA_AI_BUG_CWD = cwd;

const envPath = path.join(cwd, '.env');
try {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    });
  }
} catch (_) {}

require('../lib/index.js');
