#!/usr/bin/env node
'use strict';
// Fuehrt alle tests/*.test.js mit dem eingebauten Test-Runner von Node aus.
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).map((f) => path.join(__dirname, f));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
