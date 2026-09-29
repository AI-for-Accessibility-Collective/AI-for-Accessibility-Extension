import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {computeAccessibleDescription} from 'dom-accessibility-api';
import { reviewEvidence, cleanDecision, reviewSchema, repeatsChoiceLabels, decisionCopyIssues } from '../extension/validation/runtime.js';
import { decisionView, renderDecisionChoices } from '@ai4a11y/tools/utils/verification-decision-view.js';

const page = 'Zen has three entrance steps. Harbor has step-free access. Harbor total $680. Search other hotels.';
const request = 'Find a hotel with step-free access. Ask before selecting a hotel.';
const choice = (id, action, label, quote) => ({id, action, label, quote, instruction:label, expected:label, replaces:[]});
const decision = {kind:'choose',relevance:'now',message:'Zen has three entrance steps.',question:'Which hotel would you like?',choices:[
  choice('bad','select','Keep Zen','Zen has three entrance steps.'),
  {...choice('good','select','Select Harbor for $680 with step-free access','Harbor has step-free access.'),facts:[{name:'Total',value:'$680',quote:'Harbor total $680.'}]},
  choice('search','search','Keep looking for step-free hotels','Search other hotels.'),
]};
const verdict = {supported:true,decisionSupported:true,relevance:'now',attention:{mode:'ask',blockingStep:'Select a hotel.'},choicesSufficient:true,
  choiceReviews:decision.choices.map(c=>({id:c.id,evidenceSupported:true,respectsRequest:c.id!=='bad',consequenceClear:true,instructionMatchesLabel:true,reason:c.id==='bad'?'Violates required step-free access.':'Fits the request.'})),reason:'Step-free access is required.'};
assert(decisionCopyIssues({...decision,
  message:'I found two hotels that meet your requirements of step-free access.',
}).length > 0, 'generic criteria filler is rejected locally');
assert(decisionCopyIssues({...decision,
  message:'Both hotels have step-free access and free cancellation.',
}).length === 0, 'concrete shared facts remain valid');
async function read(overrides={}, proposal=decision, text=page, ask=request) {
  return reviewEvidence({answers:[{id:'q',question:'Which hotel?',answer:'Zen has three entrance steps.',quote:'Zen has three entrance steps.',verify:'verified_exact',decision:proposal}],noticed:[]},
    {page:text,request:ask,refine:false,call:async()=>JSON.stringify({reviews:[{id:'q',...verdict,...overrides}],outcomes:[],milestones:[],branch:{changed:false}})});
}
const result=await read();
const largeSchema=reviewSchema(Array.from({length:12},(_,i)=>({id:`q${i}`})),[],[]);
assert.equal(largeSchema.properties.reviews.minItems,undefined);
assert.equal(largeSchema.properties.reviews.maxItems,undefined);
assert.equal(largeSchema.properties.reviews.items.properties.id.enum.length,12);
assert.equal(largeSchema.properties.reviews.items.properties.reason.enum,undefined);
await reviewEvidence({answers:[],noticed:[]},{page,request,pending:[{id:'repair:adults',status:'pending',expected:'Adults: 3'}],goals:[{id:'task',goal:'Book a room'}],call:async(_prompt,{responseSchema})=>{
  assert.deepEqual(responseSchema.properties.outcomes.items.properties.id.enum,['repair:adults']);
  assert.equal(responseSchema.properties.outcomes.minItems,undefined);
  assert.deepEqual(responseSchema.properties.milestones.items.properties.goalId.enum,['task']);
  assert.equal(responseSchema.properties.reviews.maxItems,0);
  return JSON.stringify({reviews:[],outcomes:[{id:'repair:adults',status:'unknown',quote:''}],milestones:[{goalId:'task',status:'unknown',quote:''}],branch:{changed:false}});
}});
assert.deepEqual(result.answers[0].runtime.decision.choices.map(c=>c.id),['good','search']);
assert.equal(result.answers[0].runtime.support.choiceReviews.find(c=>c.id==='bad').respectsRequest,false);
const repeatedCopy = await read({}, {
  ...decision,
  message:'Please choose a hotel. Which hotel would you like?',
});
assert.equal(repeatedCopy.answers[0].runtime.decision.choices[0].action,'handover',
  'a card with a repeated question cannot reach the interface');
const malformedOption={...decision,choices:decision.choices.map(c=>c.id==='bad'?{...c,quote:'Not on the page'}:c)};
assert.deepEqual((await read({},malformedOption)).answers[0].runtime.decision.choices.map(c=>c.id),['good','search']);
const unanswered=await reviewEvidence({answers:[{id:'q',question:'Which hotel?',answer:null,quote:'',verify:'null',decision}],noticed:[]},
  {page,request,refine:false,call:async()=>JSON.stringify({reviews:[{id:'q',...verdict,supported:false}],outcomes:[],milestones:[],branch:{changed:false}})});
assert.equal(unanswered.answers[0].verify,'null');assert(!unanswered.answers[0].runtime);
assert.equal(unanswered.noticed[0].runtime.support.scope,'decision');
assert.deepEqual(unanswered.noticed[0].runtime.decision.choices.map(c=>c.id),['good','search']);
// Options without their own complete review are dropped, never trusted. With
// none left the card falls back to handing the part over.
for(const choiceReviews of [undefined,[],verdict.choiceReviews.map(v=>({...v,consequenceClear:undefined}))]) {
  const r=await read({choiceReviews});
  assert.deepEqual(r.answers[0].runtime.decision.choices.map(c=>c.action),['handover']);assert(r.meta.reviewIssues.length);
}
const partial=await read({choiceReviews:[verdict.choiceReviews[1],verdict.choiceReviews[1],verdict.choiceReviews[2]]});
assert(!partial.answers[0].runtime.decision.choices.some(c=>c.id===verdict.choiceReviews[0].id),'an unreviewed option never reaches the interface');
assert.equal((await read({choicesSufficient:false})).answers[0].runtime.decision.choices[0].action,'handover');
const specifiedRequest='Select Harbor with step-free access. Do not book anything.';
const specifiedReview={userJudgment:{status:'already-specified',quote:'Select Harbor with step-free access.',reason:'The person has chosen Harbor.'}};
const specified=(await read(specifiedReview,decision,page,specifiedRequest)).answers[0].runtime;
assert.equal(specified.decision.kind,'observe');assert.deepEqual(specified.decision.choices,[]);
assert.equal(specified.support.attention.mode,'update');
// "Already specified" without the person's words leaves the choice theirs.
const unquoted=(await read(specifiedReview)).answers[0].runtime;
assert.equal(unquoted.decision.kind,'choose');assert.equal(unquoted.support.userJudgment.status,'missing-preference');
const explicitlyAsked=(await read({userJudgment:{status:'explicitly-requested',quote:'Ask before selecting a hotel.',reason:'The person wants to choose.'}})).answers[0].runtime;
assert.equal(explicitlyAsked.decision.kind,'choose');assert.equal(explicitlyAsked.support.attention.mode,'ask');
const continueReview={decisionSupported:false,attention:{mode:'update',blockingStep:''},continuation:{message:'Zen has steps. I’ll keep looking for step-free access.',instruction:'Search other hotels with step-free access.',expected:'Hotel search results are visible.',requestQuote:'Find a hotel with step-free access.',quote:'Search other hotels.'}};
const continued=(await read(continueReview)).answers[0].runtime.decision;
assert.equal(continued.kind,'continue');assert.deepEqual(continued.choices,[]);
assert(cleanDecision({...continued,requestQuote:'Search for more step-free hotels.'},page,'Help me find a hotel.',[
  {action:'search',label:'Keep looking',instruction:'Search for more step-free hotels.'}],[]));
const mismatched={...decision,choices:decision.choices.map(c=>c.id==='good'?{...c,facts:[{name:'Total',value:'$750',quote:'Harbor total $680.'}]}:c)};
assert.deepEqual((await read({},mismatched)).answers[0].runtime.decision.choices.map(c=>c.id),['search']);
const extraChange=verdict.choiceReviews.map(v=>v.id==='good'?{...v,instructionMatchesLabel:false}:v);
assert.deepEqual((await read({choiceReviews:extraChange})).answers[0].runtime.decision.choices.map(c=>c.id),['search']);
// A continuation without the person's exact words or current evidence is
// dropped; nothing is carried out on its own.
for(const bad of [{requestQuote:'Raise the budget'},{quote:'Nonexistent search'}]){
  const r=await read({...continueReview,continuation:{...continueReview.continuation,...bad}});
  assert.notEqual(r.answers[0].runtime?.decision?.kind,'continue');assert(r.meta.reviewIssues.length);
}
// Raising a budget changes the request, not the page, so a wording objection
// does not remove it when the amount the label names is the one it applies.
const budgetPage='Total $748 including taxes. Choose another hotel.';
const budget={kind:'choose',relevance:'now',message:'The total is $748. Your limit is $700.',question:'Raise the limit or look elsewhere?',choices:[
  {id:'raise',action:'revise',label:'Raise my limit to $748',instruction:'Change the budget limit to $748',expected:'The budget limit is $748; nothing is booked yet',quote:'Total $748 including taxes.',replaces:[]},
  {id:'other',action:'search',label:'Look for another hotel',instruction:'Choose another hotel',expected:'Other hotels are listed',quote:'Choose another hotel.',replaces:[]}]};
const pedantic=budget.choices.map(c=>({id:c.id,evidenceSupported:true,respectsRequest:true,consequenceClear:true,instructionMatchesLabel:c.id!=='raise',reason:'Wording.'}));
const budgetAsk='Start with a $700 budget. If the total is higher, ask me whether to raise it.';
const offered=r=>(r.answers[0].runtime||r.noticed[0].runtime).decision.choices.map(c=>c.id);
assert.deepEqual(offered(await read({choiceReviews:pedantic},budget,budgetPage,budgetAsk)),['raise','other']);
const mismatch={...budget,choices:[{...budget.choices[0],instruction:'Change the budget limit to $900'},budget.choices[1]]};
assert.deepEqual(offered(await read({choiceReviews:pedantic},mismatch,budgetPage,budgetAsk)),['other'],
  'a revision whose amount differs from its label is still removed');
// A commitment proposed while reading a page is not asked about there; the
// gate asks once, at the button, with the real control bound.
const commitPage='Return blue jacket. Refund $80 to original card. Submit return request.';
const approveOnly={kind:'choose',relevance:'now',message:'The return is ready.',question:'Submit it?',choices:[
  {id:'go',action:'approve',label:'Submit the return',instruction:'Click Submit return request',expected:'The return is submitted',quote:'Submit return request.',replaces:[]}]};
const commitReview={choiceReviews:[{id:'go',evidenceSupported:true,respectsRequest:true,consequenceClear:true,instructionMatchesLabel:true,reason:'Fine.'}],attention:{mode:'ask',blockingStep:'Submit'}};
const notAsked=await reviewEvidence({answers:[{id:'q',question:'Approve?',answer:null,quote:'',verify:'null',decision:approveOnly}],noticed:[]},
  {page:commitPage,request:'Ask me before submitting the return.',refine:false,call:async()=>JSON.stringify({reviews:[{id:'q',...verdict,...commitReview,supported:false}],outcomes:[],milestones:[],branch:{changed:false}})});
assert.equal(notAsked.noticed.length,0,'no "could not check the options" card before the real approval');
assert(!notAsked.answers[0].runtime);
// Two proposals on one page: one question with reviewed options, one whose
// options failed. The person answers the real one and is not asked again.
{
  const good=decision.choices.slice(1);
  const pair=await reviewEvidence({answers:[
    {id:'a',question:'Which hotel?',answer:'Harbor has step-free access.',quote:'Harbor has step-free access.',verify:'verified_exact',decision:{...decision,choices:good}},
    {id:'b',question:'Which hotel again?',answer:'Zen has three entrance steps.',quote:'Zen has three entrance steps.',verify:'verified_exact',decision:{...decision,question:'Pick one?',choices:[decision.choices[0]]}},
  ],noticed:[]},{page,request,refine:false,call:async()=>JSON.stringify({reviews:[
    {id:'a',...verdict,choiceReviews:verdict.choiceReviews.slice(1)},
    {id:'b',...verdict,choiceReviews:[verdict.choiceReviews[0]]},
  ],outcomes:[],milestones:[],branch:{changed:false}})});
  const [a,b]=pair.answers;
  assert.deepEqual(a.runtime.decision.choices.map(c=>c.id),['good','search']);
  assert.equal(b.runtime.decision.choices[0].action,'handover');
  assert.equal(b.runtime.duplicateOf,'a','the stand-in card is not asked after the real question');
}
let edits=0,reviews=0;
const retry=await reviewEvidence({answers:[{id:'q',question:'Which hotel?',answer:'Zen has three entrance steps.',quote:'Zen has three entrance steps.',verify:'verified_exact',decision}],noticed:[]},
  {page,request,call:async(_prompt,{tag,responseSchema})=>{
    if(tag==='revise-decisions'){
      assert.deepEqual(responseSchema.properties.decisions.items.properties.id.enum,['q']);
      edits++;return JSON.stringify({decisions:[{id:'q',decision}]});
    }
    reviews++;return JSON.stringify({reviews:[{id:'q',...verdict,decisionSupported:false}],outcomes:[],milestones:[],branch:{changed:false}});
  }});
assert.equal(edits,1);assert.equal(reviews,2);assert.equal(retry.answers[0].runtime.decision.choices[0].action,'handover');
let secondReviewSawQuestion=false;
const changedKind=await reviewEvidence({answers:[{id:'q',question:'Which hotel?',answer:null,quote:'',verify:'null',decision}],noticed:[]},
  {page,request,call:async(prompt,{tag})=>{
    if(tag==='revise-decisions')return JSON.stringify({decisions:[{id:'q',decision:{...decision,kind:'observe',question:'',choices:[]}}]});
    const proposals=JSON.parse(prompt.split('Proposals: ')[1].split('\n')[0]);
    if(proposals[0]?.decision.kind==='observe')secondReviewSawQuestion=true;
    return JSON.stringify({reviews:proposals.map(c=>({id:c.id,...verdict,choiceReviews:c.decision.choices.length?verdict.choiceReviews:[],supported:false,decisionSupported:false})),outcomes:[],milestones:[],branch:{changed:false}});
  }});
assert(secondReviewSawQuestion);assert.equal(changedKind.noticed[0].verify,'decision_required');
assert.equal(changedKind.noticed[0].runtime.decision.choices[0].action,'handover');

// Same renderer and response identity for both surfaces. Different values
// have aligned fields, unknowns are visible, page strings cannot become HTML.
const second={...decision.choices[1],id:'other',label:'Select Bay for $640',facts:[{name:'Total',value:'$640',quote:'$640'},{name:'Cancellation',value:'Free until Friday',quote:'Free until Friday'}]};
const state={taskId:'test',gate:{allowed:false,leading:'hotel',waitingOn:['hotel']},findings:[{widget:'hotel',runtime:{decision:{...decision,choices:[decision.choices[1],second,decision.choices[2]]}}}]};
assert.equal(decisionView(state).kind,'comparison');
const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>');
const calls=[];
const view=renderDecisionChoices(state,{document:dom.window.document,buttonClass:'va-do',keyAttribute:'data-va-key',onChoice:p=>calls.push(p)});
dom.window.document.body.append(view);
assert.deepEqual([...view.querySelectorAll('.vd-option dt')].map(n=>n.textContent),['Total','Cancellation','Total','Cancellation']);
assert(view.textContent.includes('Not stated'));
assert.equal(view.querySelectorAll('.primary,.aw-primary').length,0);
view.querySelectorAll('.vd-option button')[1].click();
assert.equal(calls[0].choiceId,'other');assert.equal(calls[0].taskId,'test');assert(calls[0].decisionKey);
state.findings[0].runtime.decision.choices[0].facts.push({name:'Access',value:'Step-free',quote:'Step-free'});
state.findings[0].runtime.decision.choices[1].facts.push({name:'Access',value:'Step-free',quote:'Step-free'});
const compact=renderDecisionChoices(state,{document:dom.window.document,buttonClass:'va-do',keyAttribute:'data-va-key',onChoice:p=>calls.push(p)});
assert.deepEqual([...compact.querySelectorAll('.vd-shared dd')].map(n=>n.textContent),['Step-free']);
assert(![...compact.querySelectorAll('.vd-option dt')].some(n=>n.textContent==='Access'));
assert.deepEqual([...compact.querySelectorAll('.vd-option dt')].map(n=>n.textContent),['Total','Cancellation','Total','Cancellation']);
dom.window.document.body.append(compact);
const descriptions=[...compact.querySelectorAll('.vd-option button')].map(b=>computeAccessibleDescription(b));
assert(descriptions.every(d=>d.includes('Cancellation')));
assert(descriptions.every(d=>!d.includes('Step-free')),'shared details are not repeated on every option');
assert.equal(compact.querySelector('.vd-shared').getAttribute('aria-label'),'Shared details');
assert.equal(compact.querySelector('.vd-shared').textContent.includes('Step-free'),true);
assert(descriptions[0].includes('$680')&&!descriptions[0].includes('$640'));
assert(descriptions[1].includes('$640')&&!descriptions[1].includes('$680'));
state.findings[0].runtime.decision={...decision,kind:'commit',choices:[{...choice('pay','approve','Book for $680','Total $680. <script>bad()</script>'),facts:[]}]};
const commit=renderDecisionChoices(state,{document:dom.window.document,buttonClass:'aw-do',keyAttribute:'data-aw-key',onChoice:p=>calls.push(p)});
assert.equal(commit.dataset.view,'commitment');assert.equal(commit.querySelector('script'),null);assert(commit.textContent.includes('<script>'));
dom.window.document.body.append(commit);
assert.equal(computeAccessibleDescription(commit.querySelector('.vd-option button')),'Total $680. <script>bad()</script>');
assert.notEqual(compact.id,commit.id);

// Host-page IDs must never replace verified facts in the accessible description.
const hostileDom=new JSDOM('<!doctype html><html><head></head><body></body></html>');
const hostDoc=hostileDom.window.document;
for(const id of ['verification-options-2','verification-options-4']){
  const existing=hostDoc.createElement('p');existing.id=id;
  existing.textContent='Total $1. No charge will be made.';hostDoc.body.append(existing);
}
for(let i=1;i<=64;i++)for(const suffix of ['shared','details-0','source-0']){
  const existing=hostDoc.createElement('p');existing.id=`verification-options-${i}-${suffix}`;
  existing.textContent='Total $1. No charge will be made.';hostDoc.body.append(existing);
}
const comparisonState=structuredClone(state);
comparisonState.findings[0].runtime.decision={...decision,kind:'choose',choices:[decision.choices[1],second]};
const commitState=structuredClone(state);
commitState.findings[0].runtime.decision.choices[0].facts=[{name:'Total',value:'$680',quote:'Total $680.'}];
for(const candidate of [comparisonState,commitState,state]){
  const rendered=renderDecisionChoices(candidate,{document:hostDoc,buttonClass:'va-do',keyAttribute:'data-va-key',onChoice:()=>{}});
  hostDoc.body.append(rendered);
  const button=rendered.querySelector('.vd-option button');
  const description=computeAccessibleDescription(button);
  assert(description.includes('$680')&&!description.includes('$1'),'only verified option facts describe the button');
  if(candidate===comparisonState){
    assert(!description.includes('Step-free'),'shared facts are not redundantly attached to every option');
    assert(rendered.querySelector('.vd-shared')?.textContent.includes('Step-free'),'shared facts remain visible once');
  }
}
// Independently bundled surfaces can render before either attaches to the page.
const secondRenderer=await import(import.meta.resolve('@ai4a11y/tools/utils/verification-decision-view.js') + '?separate-bundle');
const detached=[renderDecisionChoices,secondRenderer.renderDecisionChoices].map(render=>render(commitState,
  {document:hostDoc,buttonClass:'va-do',keyAttribute:'data-va-key',onChoice:()=>{}}));
hostDoc.body.append(...detached);
const renderedIds=[...hostDoc.querySelectorAll('[id]')].map(n=>n.id);
assert.equal(new Set(renderedIds).size,renderedIds.length,'every referenced ID is unique across detached surfaces');
console.log('PASS per-option rejection; complete reviews required; authorized continuation; sufficient alternatives; aligned comparison; exact choice binding; neutral order; commitment evidence');

const timeDecision={kind:'choose',relevance:'now',message:'October 16 has times at 14:30 and 15:30.',question:'Which time works?',
  choices:['14:30','15:30'].map((time,i)=>choice('time'+i,'select',time,time))};
assert.equal(repeatsChoiceLabels(timeDecision),true);
assert.equal(repeatsChoiceLabels({...timeDecision,message:'October 16 has afternoon appointments.'}),false);
assert.equal(repeatsChoiceLabels({...timeDecision,message:'114:30 and 115:30 are different values.'}),false);
assert.equal(repeatsChoiceLabels({...timeDecision,choices:[{label:'C++'},{label:'C#'}],message:'Choose C++ or C#.'}),true);
assert.equal(repeatsChoiceLabels({...timeDecision,choices:[{label:'14:30'},{label:'14:30'}]}),false);
assert.equal(repeatsChoiceLabels({...timeDecision,choices:[{label:'Standard'},{label:'Standard Plus'}],message:'Standard Plus includes breakfast.'}),false);
assert.equal(repeatsChoiceLabels({...timeDecision,choices:[{label:'Standard'},{label:'Standard Plus'}],message:'Standard and Standard Plus have rooms.'}),true);
for(const fixCopy of [true,false]) {
  const calls=[];const revised={...timeDecision,message:fixCopy?'October 16 has afternoon appointments.':timeDecision.message};
  const result=await reviewEvidence({answers:[{id:'time',question:'Which time?',answer:'Afternoon appointments.',quote:'14:30 and 15:30',verify:'verified_exact',decision:timeDecision}],noticed:[]},
    {page:'October 16. 14:30 and 15:30.',request:'Ask which time works.',call:async(prompt,opts)=>{
      calls.push(opts.tag);
      if(opts.tag==='revise-decisions')return JSON.stringify({decisions:[{id:'time',decision:revised}]});
      return JSON.stringify({reviews:[{id:'time',supported:true,decisionSupported:true,relevance:'now',attention:{mode:'ask',blockingStep:'Select a time'},choicesSufficient:true,
        choiceReviews:timeDecision.choices.map(c=>({id:c.id,evidenceSupported:true,respectsRequest:true,consequenceClear:true,instructionMatchesLabel:true,reason:'Supported time.'})),reason:'The user must choose.'}],outcomes:[],milestones:[],branch:{changed:false}});
    }});
  assert.deepEqual(calls,['review-evidence','revise-decisions','review-evidence']);
  const got=result.answers[0].runtime.decision;
  if(fixCopy){assert.equal(got.message,revised.message);assert.deepEqual(got.choices,timeDecision.choices);}
  else assert.equal(got.choices[0].action,'handover','a second failed rewrite cannot leak duplicated copy');
}
console.log('PASS literal option recitation gets one reviewed rewrite without changing choices');
