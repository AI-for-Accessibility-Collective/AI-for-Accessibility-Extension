import assert from 'node:assert/strict';
import {reviewEvidence} from '../extension/validation/runtime.js';
import {decide} from '../extension/validation/policy.js';
const page='Optional analytics cookies. Accept or reject. The article is readable. Two rooms cost $180 and $210.';
const request='Read the article. Ask me before selecting a room.';
const observed={kind:'observe',relevance:'now',message:'The article is readable.',question:'',choices:[],requestQuote:'',instruction:'',expected:''};
const choice={...observed,kind:'choose',message:'Optional analytics cookies are offered.',question:'Would you like cookies?',choices:[{id:'accept',label:'Accept analytics cookies',action:'select',instruction:'Accept analytics cookies.',expected:'Analytics enabled.',quote:'Optional analytics cookies.'}]};
async function review(decision,{mode='none',supported=true,claimSupported=true,blockingStep='',reason='The task can continue reading.'}={}) {
  const read={answers:[{id:'q',question:'What is needed?',answer:'The article is readable.',quote:'The article is readable.',verify:'verified_exact',decision}],noticed:[],nodeStates:[]};
  return reviewEvidence(read,{page,request,refine:false,call:async()=>JSON.stringify({reviews:[{id:'q',supported:claimSupported,decisionSupported:supported,choiceReviews:decision.choices.map(c=>({id:c.id,evidenceSupported:true,respectsRequest:true,consequenceClear:true,instructionMatchesLabel:true,reason:'Controlled fixture option.'})),choicesSufficient:true,relevance:'now',attention:{mode,reason,blockingStep},reason:'Quote proves the article is readable.'}],outcomes:[],milestones:[],branch:{changed:false}})});
}
const ordinary=(await review(observed)).answers[0];
assert.equal(decide({runtime:ordinary.runtime,speak:'gate',moneyMoving:true},{routing:'utility'}).level,'ambient');
const optional=(await review(choice,{supported:false})).answers[0];
assert.equal(optional.runtime.decision.kind,'observe');assert.deepEqual(optional.runtime.decision.choices,[]);
assert.equal(decide({runtime:optional.runtime},{routing:'utility'}).level,'ambient');
const required=(await review(choice,{supported:false,mode:'ask',blockingStep:'Select a room.'})).answers[0];
assert.equal(required.runtime.decision.kind,'choose');assert.equal(required.runtime.decision.choices[0].action,'handover');
assert.equal(decide({runtime:required.runtime},{routing:'utility'}).level,'stop');
// When the reader and the reviewer disagree about one claim, that claim takes
// the cautious reading and the rest of the page stands. These used to fail the
// whole page, which stopped the agent with every other finding lost.
const told=r=>{const a=r.answers[0];assert.equal(a.runtime.decision.kind,'observe');assert.deepEqual(a.runtime.decision.choices,[]);
  assert.notEqual(decide({runtime:a.runtime},{routing:'utility'}).level,'stop');assert(r.meta.reviewIssues?.length);};
// The reviewer found no choice needed: told, not asked.
told(await review(choice));
// The reviewer wants an answer the reader did not ask for: told, and a
// proposed repair is not carried out on its own.
told(await review(observed,{mode:'ask',blockingStep:'Choose a room.'}));
told(await review({...observed,kind:'repair',requestQuote:'Ask me before selecting a room',instruction:'Select the $180 room.',expected:'Room selected.'},{mode:'ask',blockingStep:'Choose a room.'}));
// An ask with no blocking step is still an ask.
const unexplained=(await review(choice,{mode:'ask'})).answers[0];
assert.equal(unexplained.runtime.decision.kind,'choose');assert.equal(decide({runtime:unexplained.runtime},{routing:'utility'}).level,'stop');
// No attention verdict: a plain observation is told, never asked.
const noVerdict=await review(observed,{mode:'invalid'});
assert.equal(noVerdict.answers[0].runtime.support.attention.mode,'update');assert(noVerdict.meta.reviewIssues.length);
const separate=await review(choice,{claimSupported:false,mode:'ask',blockingStep:'Select a room.'});
assert.equal(separate.answers[0].verify,'unsupported');assert(!separate.answers[0].runtime);
assert.equal(separate.noticed[0].runtime.support.scope,'decision');
assert.equal(decide({runtime:separate.noticed[0].runtime},{routing:'utility'}).level,'stop');
const bothRejected=await review(choice,{claimSupported:false,supported:false,mode:'ask',blockingStep:'Select a room.'});
assert.equal(bothRejected.noticed.length,1);assert.equal(bothRejected.answers[0].verify,'unsupported');
assert.equal(bothRejected.noticed[0].verify,'decision_required');assert.equal(bothRejected.noticed[0].runtime.decision.choices[0].action,'handover');
console.log('PASS routine information stays quiet; unsupported optional choices do not hold; real uncertainty holds; inconsistent repairs and incomplete attention reviews fail closed');
