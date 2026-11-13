const fs=require('fs'),crypto=require('crypto');
const p=__dirname+'/index.html';let s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const script=s.match(/<script>([\s\S]*?)<\/script>/)[1];
const hash=crypto.createHash('sha256').update(script).digest('base64');
s=s.replace(/script-src [^;]+;/,`script-src 'self' 'sha256-${hash}' https://accounts.google.com;`);
fs.writeFileSync(p,s);console.log('CSP script hash updated');
