import assert from 'node:assert/strict';
import {build} from 'esbuild';
const events=[];let failures=new Set();
globalThis.chrome={runtime:{},debugger:{async attach(){},async detach(){},
  onEvent:{addListener(){}},onDetach:{addListener(){}},
  sendCommand(_target,method,args,callback){
    events.push({method,args});
    if(failures.has(args?.type))chrome.runtime.lastError={message:'Input acknowledgement was lost'};
    callback({});delete chrome.runtime.lastError;
  },
}};
const bundled=await build({entryPoints:['extension/browser-harness/src/harness/input.js'],bundle:true,write:false,format:'esm',platform:'browser',loader:{'.bhinject':'text'}});
const {bhClickAt,bhPressKey}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
for(const failed of [[],['mousePressed'],['mouseReleased'],['mousePressed','mouseReleased']]) {
  failures=new Set(failed);events.length=0;
  const click=bhClickAt(1,100,100,{snap:false});
  if(failed.length)await assert.rejects(click,/outcome is uncertain/);else await click;
  assert.equal(events.filter(e=>e.args?.type==='mousePressed').length,1);
  assert.equal(events.filter(e=>e.args?.type==='mouseReleased').length,1);
  assert(!events.some(e=>e.method==='Runtime.evaluate'),'uncertain delivery must not trigger a JS click');
  assert(events.findIndex(e=>e.method==='Emulation.setFocusEmulationEnabled')<events.findIndex(e=>e.args?.type==='mousePressed'));
}
console.log('PASS lost press/release acknowledgements never cause a duplicate click');
failures=new Set();
for(const key of ['!','"','#','$','%','&',"'",'(',')','é','🙂']){
  events.length=0;await bhPressKey(1,key);
  const down=events.find(e=>e.args?.type==='keyDown');
  assert.equal(down.args.windowsVirtualKeyCode,0,'punctuation must not invoke navigation keys');
  assert.deepEqual(events.filter(e=>e.args?.type==='char').map(e=>e.args.text),[key]);
}
events.length=0;await bhPressKey(1,'a',4);
assert.equal(events.find(e=>e.args?.type==='keyDown').args.windowsVirtualKeyCode,65);
assert(!events.some(e=>e.args?.type==='char'),'a shortcut must not also insert text');
console.log('PASS punctuation and Unicode never invoke navigation keys; shortcuts do not insert text');
