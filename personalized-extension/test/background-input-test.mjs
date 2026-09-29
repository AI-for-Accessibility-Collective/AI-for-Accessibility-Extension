import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import puppeteer from 'puppeteer';
import { auditDir } from './audit-dir.mjs';

const out = path.join(auditDir, 'background-input');
const runId = new Date().toISOString().replace(/[:.]/g,'-');
fs.mkdirSync(out, { recursive: true });
const html = `<!doctype html><meta charset="utf-8"><title>Background input fixture</title>
<style>body{margin:0;height:5000px;font:18px sans-serif}header{position:fixed;inset:0 0 auto;background:white;padding:20px;z-index:1}
#nested{position:fixed;top:180px;left:20px;width:260px;height:180px;overflow:auto}#nested div{height:2000px;width:1800px;background:linear-gradient(#eee,#aaa)}
#shadow{position:fixed;top:180px;left:320px}iframe{position:fixed;top:400px;left:20px;width:260px;height:150px}canvas{position:fixed;top:400px;left:320px;background:#eee}</style>
<header><h1>Background input fixture</h1><label>Text <input id="field" value="before"></label><button id="button">Count clicks</button><output id="count">0</output></header>
<div id="nested"><div>Nested scroll area</div></div><div id="shadow"></div><iframe src="/frame"></iframe><canvas width="260" height="150"></canvas>
<script>window.clicks=0;window.wheels=0;window.wheelEvents=0;window.wheelDetails=[];document.addEventListener('wheel',e=>{window.wheelEvents++;window.wheelDetails.push({target:e.target.tagName,x:e.clientX,y:e.clientY,dy:e.deltaY,dx:e.deltaX,at:performance.now()});},true);button.onclick=()=>count.textContent=++window.clicks;
const root=shadow.attachShadow({mode:'open'});root.innerHTML='<div id="scroller" style="width:260px;height:180px;overflow:auto"><div style="height:2000px;background:#ddd">Shadow scroll area</div></div>';
document.querySelector('canvas').addEventListener('wheel',e=>{e.preventDefault();window.wheels++},{passive:false});</script>`;
const server = http.createServer((req, res) => { res.setHeader('Content-Type','text/html'); res.end(req.url === '/frame'
  ? '<!doctype html><body style="height:2500px">Frame scroll area</body>' : html); });
await new Promise(r => server.listen(0,'127.0.0.1',r));
const browser = await puppeteer.launch({headless:true,protocolTimeout:20000,
  // Use a real window size. A second client's emulated viewport can retain
  // DOM dimensions while Chrome resets input bounds on debugger detach.
  userDataDir:fs.mkdtempSync(path.join(out,'profile-')),defaultViewport:null,
  args:['--window-size=1000,1000',`--disable-extensions-except=${path.resolve('extension')}`,`--load-extension=${path.resolve('extension')}`]});
const results=[];
try {
  const worker=await (await browser.waitForTarget(t=>t.type()==='service_worker')).worker();
  const page=await browser.newPage(); const url=`http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.screenshot({path:path.join(out,'before.png')});
  const other=await browser.newPage(); await other.goto(url+'other'); await other.bringToFront();
  const tabId=await worker.evaluate(async u=>(await chrome.tabs.query({})).find(t=>t.url===u).id,url);
  const active=()=>worker.evaluate(async()=>(await chrome.tabs.query({active:true,currentWindow:true}))[0].id);
  const originalActive=await active(); assert.notEqual(tabId,originalActive);
  const backgroundAgain=async()=>{
    // Emulated page focus can confuse Puppeteer's Page.bringToFront shortcut.
    // Switch the actual Chrome tab, as a user would, then check its identity.
    await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),originalActive);
    const deadline=Date.now()+2000;
    while(await active()!==originalActive && Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
    assert.equal(await active(),originalActive,'fixture must finish switching tabs before input');
  };
  const js=expression=>worker.evaluate(({tabId,expression})=>BrowserHarness.js(tabId,expression),{tabId,expression});
  const action=async(method,args=[])=>{
    const at=Date.now();
    await worker.evaluate(({tabId,method,args})=>BrowserHarness[method](tabId,...args),{tabId,method,args});
    results.push({method,args,ms:Date.now()-at,scrollY:await js('scrollY')});
    assert.equal(await active(),originalActive,'input must not activate the agent tab');
  };
  const settled=async(expression,predicate)=>{
    const deadline=Date.now()+3000;
    let value;
    while(Date.now()<deadline){value=await js(expression);if(predicate(value))return value;await new Promise(r=>setTimeout(r,30));}
    results.push({failure:{expression,value,state:await js('({scrollY,focus:document.activeElement?.id,wheels:window.wheelEvents,canvasWheels:window.wheels,events:window.wheelDetails,visibility:document.visibilityState,focused:document.hasFocus()})')}});
    assert.fail('Input did not reach expected state: '+expression+'; actual '+JSON.stringify(value));
  };
  for(let cycle=0;cycle<3;cycle++) {
    if(cycle===1) await action('detach');
    if(cycle===2) await page.goto(url+'?navigated');
    await js('window.scrollTo(0,0)');
    await action('scroll',[800,650,320]);
    const y=await settled('scrollY',v=>v===320);
    const nestedY=await js('nested.scrollTop');
    await action('scroll',[100,240,240]);
    await settled('nested.scrollTop',v=>v===nestedY+240);
    assert.equal(await js('scrollY'),y,'nested scroll must not move the document');
    const nestedX=await js('nested.scrollLeft');
    await action('scroll',[100,240,0,180]);
    await settled('nested.scrollLeft',v=>v===nestedX+180);
    const shadowY=await js('shadow.shadowRoot.querySelector("#scroller").scrollTop');
    await action('scroll',[400,240,220]);
    await settled('shadow.shadowRoot.querySelector("#scroller").scrollTop',v=>v===shadowY+220);
    const frameY=await js('document.querySelector("iframe").contentWindow.scrollY');
    await action('scroll',[100,450,210]);
    await settled('document.querySelector("iframe").contentWindow.scrollY',v=>v===frameY+210);
    assert.equal(await js('scrollY'),y,'iframe scroll must not move the document');
    const wheels=await js('window.wheels');
    await action('scroll',[400,450,200]);
    await settled('window.wheels',v=>v===wheels+1);
    assert.equal(await js('scrollY'),y,'a prevented canvas wheel must not move the document');
    // Check for delayed wheel delivery before text focus can scroll a caret.
    const afterWheels=await js('[scrollY,window.wheelEvents]');
    await page.bringToFront();
    await page.screenshot({path:path.join(out,`scroll-${cycle+1}.png`)});
    assert.deepEqual(await js('[scrollY,window.wheelEvents]'),afterWheels);
    await backgroundAgain();
    const clickPoint=await js('(()=>{const r=button.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()');
    const clicks=await js('window.clicks');
    await action('clickAt',clickPoint);
    assert.equal(await js('window.clicks'),clicks+1);
    await action('fillInput',['#field','hello']);
    assert.equal(await js('field.value'),'hello');
    await action('pressKey',['End']);
    await action('typeText',[' world']);
    await action('pressKey',['!']);
    assert.equal(await js('field.value'),'hello world!','text and key input arrive once');
    if(cycle===0){
      for(const key of ['"','#','$','%','&',"'",'(',')','é','🙂'])await action('pressKey',[key]);
      assert.equal(await js('field.value'),`hello world!"#$%&'()é🙂`,'punctuation cannot move the caret');
    }
    // Bringing the page forward must not release previously queued scrolls.
    const beforeFront=await js('[window.wheelEvents,nested.scrollTop,nested.scrollLeft,shadow.shadowRoot.querySelector("#scroller").scrollTop,document.querySelector("iframe").contentWindow.scrollY]');
    await page.bringToFront();
    await page.screenshot({path:path.join(out,`cycle-${cycle+1}.png`)});
    assert.equal(await js('scrollY'),y,'typing in a fixed input must not invoke Page Up or Page Down');
    assert.deepEqual(await js('[window.wheelEvents,nested.scrollTop,nested.scrollLeft,shadow.shadowRoot.querySelector("#scroller").scrollTop,document.querySelector("iframe").contentWindow.scrollY]'),beforeFront);
    assert.equal(await js('window.clicks'),clicks+1);
    await backgroundAgain();
  }
  await action('detach');
  assert.equal(await page.evaluate(()=>document.hasFocus()),false,'detach restores ordinary background focus');
  console.log(`PASS ${results.length} background inputs across reconnect and navigation`);
} catch(error) {
  results.push({failure:{message:error.message}});
  throw error;
} finally {
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
  fs.writeFileSync(path.join(out,runId+'-results.json'),JSON.stringify(results,null,2));
  await browser.close();await new Promise(r=>server.close(r));
}
