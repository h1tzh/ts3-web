require('dotenv').config();
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

console.log('开始构建...');

const apiKey = process.env.API_KEY || '';

const srcPath = path.join(__dirname, 'public', 'index.src.html');
const htmlPath = path.join(__dirname, 'public', 'index.html');

let html = fs.readFileSync(srcPath, 'utf-8');

html = html.replace('__API_KEY__', apiKey);

const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
let match;
let count = 0;
const matches = [];

while ((match = scriptRegex.exec(html)) !== null) {
  matches.push({ content: match[1], index: match.index, length: match[0].length });
}

for (const m of matches) {
  if (m.content.trim().length < 100) continue;
  
  console.log(`混淆第 ${++count} 段脚本...`);
  
  const obfuscatedCode = JavaScriptObfuscator.obfuscate(m.content, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  }).getObfuscatedCode();
  
  html = html.replace(m.content, '\n' + obfuscatedCode + '\n');
}

fs.writeFileSync(htmlPath, html, 'utf-8');

console.log(`构建完成！混淆了 ${count} 段脚本`);
console.log(`API Key: ${apiKey ? '已注入' : '未设置（无需鉴权）'}`);
