import assert from 'node:assert/strict';
import {progressContext} from '../extension/validation/progress.js';
import {flattenModel,buildPrompt} from '../extension/validation/reasoner.js';
import {reviewEvidence} from '../extension/validation/runtime.js';
const progress={
 '0':{id:'0',label:'Reserve',status:'unchecked',evidence:null},
 '1':{id:'1',label:'Choose',status:'active',evidence:null},
 '2':{id:'2',label:'Previous choice',status:'unresolved',evidence:null},
 '3':{id:'3',label:'Receipt',status:'completed',evidence:{quote:'Confirmed A123',url:'https://example.test/receipt',at:20}},
 '4':{id:'4',label:'Optional branch',status:'not-applicable',evidence:{quote:'Do not send',source:'request'}},
 '5':{id:'5',label:'Unfinished check',status:'unchecked',evidence:null,checks:{q:{question:'Current cost?',answer:'$18',quote:'Total $18',at:10,contradicts:true}}},
 '6':{id:'6',label:'Unchecked evidence',status:'unchecked',evidence:{quote:'Needs checking',at:5}},
};
const original=structuredClone(progress),projected=progressContext(progress);
assert.deepEqual(Object.keys(projected),['1','2','3','4','5','6']);
for(const [id,context] of Object.entries(projected))assert.deepEqual({id,...context},progress[id]);
assert.deepEqual(progress,original);assert.deepEqual(progressContext(null),{});
const flat=flattenModel({task:'Reserve',tree:{id:'0',label:'Reserve',children:[
 {id:'1',label:'Choose',questions:[{question:'Which item?'}]},
 {id:'7',label:'Later',questions:[{question:'Did the price change?'}]},
]}});
const prompt=buildPrompt(flat,'Total $18',{runtime:true,progress});
assert(prompt.includes('omitted nodes are unchecked with no evidence'));
assert(prompt.includes(JSON.stringify(projected)));
for(const q of flat.questions)assert(prompt.includes(`${q.id} | ${q.subtask} | ${q.question}`),'all questions remain regardless of progress');
let reviewed=false;
await reviewEvidence({answers:[],noticed:[]},{page:'Total $18',request:'Reserve',progress,call:async prompt=>{
 assert(prompt.includes(JSON.stringify(projected)));assert(prompt.includes('omitted nodes are unchecked with no evidence'));
 reviewed=true;return JSON.stringify({reviews:[],outcomes:[],milestones:[],branch:{changed:false}});
}});
assert(reviewed);
console.log('PASS prompt projection retains every nonempty progress record and all HTA questions without mutating session state');
