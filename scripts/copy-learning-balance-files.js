'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'dist');

fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, 'config', 'learning-rating.json'), path.join(output, 'learning-rating.json'));
fs.copyFileSync(path.join(root, 'apply-learning-balance.bat'), path.join(output, 'apply-learning-balance.bat'));
console.log('Copied learning balance template and apply BAT to dist.');
