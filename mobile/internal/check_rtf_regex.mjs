import fs from 'node:fs';
const s = fs.readFileSync('mobile/internal/rtf_sample_qa.rtf','utf8');
console.log(s.match(/\\'[0-9a-fA-F]{2}/g));
console.log(s.replace(/\\'([0-9a-fA-F]{2})/g,(_,h)=>new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(h,16)])).replace(/./g,c=>`[${c.codePointAt(0).toString(16)}]`)).match(/d\[[^\]]+\]indexation/));
