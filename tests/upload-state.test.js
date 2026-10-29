import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackImportRead, cancelImportRead } from '../src/js/components/upload-state.js';
class Reader extends EventTarget {
  readyState=1; error=null; aborted=false;
  abort(){this.aborted=true;this.readyState=2;this.dispatchEvent(new Event('abort'));this.dispatchEvent(new Event('loadend'));}
}
function setup(fn) {
  const original=globalThis.document;
  const input=new EventTarget(),confirm={disabled:true},events=[];
  input.addEventListener('import-file-state',event=>events.push(event.detail));
  globalThis.document={getElementById:id=>id==='test-upload'?input:confirm};
  try {fn({input,confirm,events});} finally {cancelImportRead('test-upload');globalThis.document=original;}
}
test('file progress becomes ready only after the parser enables confirmation',()=>setup(({confirm,events})=>{
  const reader=new Reader(),file={name:'grades.xlsx'};
  trackImportRead(reader,file,'test-upload','confirm');
  const progress=new Event('progress');Object.assign(progress,{lengthComputable:true,loaded:50,total:100});reader.dispatchEvent(progress);
  assert.equal(events.at(-1).progress,.5);
  assert.equal(events.at(-1).state,'reading');
  confirm.disabled=false;reader.readyState=2;reader.dispatchEvent(new Event('loadend'));
  assert.equal(events.at(-1).state,'ready');assert.match(events.at(-1).message,/Chưa lưu database/);
}));
test('a readable file rejected by the parser is failed, never ready',()=>setup(({events})=>{
  const reader=new Reader();trackImportRead(reader,{name:'broken.xlsx'},'test-upload','confirm');
  reader.readyState=2;reader.dispatchEvent(new Event('loadend'));
  assert.equal(events.at(-1).state,'failed');
}));
test('changing or rejecting a selection aborts the previous read and ignores its late events',()=>setup(({events})=>{
  const reader=new Reader();trackImportRead(reader,{name:'old.xlsx'},'test-upload','confirm');
  const count=events.length;cancelImportRead('test-upload');
  assert.equal(reader.aborted,true);reader.dispatchEvent(new Event('loadend'));
  assert.equal(events.length,count);
}));
