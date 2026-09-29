import assert from 'node:assert/strict';
import {workflows,matchesPreference} from './fixtures/interactive-workflows.mjs';
const hotel=workflows.find(w=>w.id==='hotel');
const answers=hotel.expectedDecisions.map((preference,i)=>({preference,at:i*10,submitted:true}));
const truth={booked:true,hotel:'zen',room:'queens',adults:'3',total:748,name:'Morgan Lee',email:'morgan@example.test',breakfast:false,insurance:false,marketing:false};
const events=[{type:'select-hotel',at:1,data:{hotel:'zen'}},{type:'select-room',at:11,data:{room:'queens'}},{type:'book',at:31,data:{...truth}}];
const all=(s=truth,e=events,a=answers)=>hotel.oracle(s,e,a).every(([,pass])=>pass===true);
assert(all());
assert(!all(truth,[{type:'select-hotel',at:0,data:{hotel:'harbor'}},...events]));
assert(!all(truth,[{type:'select-room',at:11,data:{room:'fulls'}},...events]));
assert(!all(truth,[...events,{type:'book',at:40,data:{}}]));
assert(!all(truth,events,answers.filter(a=>a.preference!=='hotel')));
assert(!all(truth,events,answers.map(a=>a.preference==='commit'?{...a,at:32}:a)));
const preference=hotel.preference({stage:'extras'},[]);
assert(matchesPreference(preference,{label:'Raise total budget to $750',instruction:'Set only the budget to $750.',expected:'Budget is $750.',action:'revise'}));
assert(matchesPreference(preference,{label:'Raise total budget to $748',instruction:'Set only the budget to $748.',expected:'Budget is $748.',action:'revise'}));
assert(!matchesPreference(preference,{label:'Raise total budget to $900',instruction:'Set budget to $900.',expected:'Budget is $900.',action:'revise'}));
assert(!matchesPreference(preference,{label:'Raise total budget to $750',instruction:'Set budget to $900.',expected:'Budget is $900.',action:'revise'}));
assert(!matchesPreference(preference,{label:'Raise total budget to $750',instruction:'Increase the budget from 750 to 900 dollars.',expected:'Budget is 900 dollars.',action:'revise'}));
assert(!matchesPreference(preference,{label:'Raise total budget to $750',instruction:'Set budget to USD 900.',expected:'Budget is 900 USD.',action:'revise'}));
assert(!matchesPreference(preference,{label:'Raise total budget to $750',instruction:'Book it.',expected:'Booking complete.',action:'approve'}));
const appointment=workflows.find(w=>w.id==='appointment');
const a=[{preference:'format',submitted:true,at:0},{preference:'time',submitted:true,at:10},{preference:'commit',submitted:true,at:30}];
const e=[{type:'select-format',at:1,data:{format:'clinic'}},{type:'select-time',at:11,data:{time:'15:30'}},{type:'read-terms',at:20},{type:'confirm',at:31}];
const t={confirmed:true,format:'clinic',time:'15:30',name:'Morgan Lee',email:'morgan@example.test',sms:false};
e.find(v=>v.type==='confirm').data={...t};
assert(appointment.oracle(t,e,a).every(([,pass])=>pass));
assert(!appointment.oracle(t,e.map(v=>v.type==='read-terms'?{...v,at:30.5}:v),a).find(([id])=>id==='terms-before-approval')[1]);
// HTTP actions, not the audit runner's page progression, produce the state.
const state=structuredClone(hotel.initial),log=[];
for(const route of ['/hotel/start','/hotel/results?adults=3','/hotel/rooms?hotel=zen','/hotel/extras?room=queens','/hotel/guest','/hotel/review?name=Morgan+Lee&email=morgan%40example.test','/hotel/confirmed']) {
  const html=hotel.serve(new URL(route,'http://localhost'),state,(type,data)=>log.push({type,data}));
  assert(html.includes('<main>'));
}
assert.equal(state.total,748);assert(state.booked);assert.equal(state.name,'Morgan Lee');
assert.equal(log.filter(e=>e.type==='book').length,1);
console.log('PASS workflow oracles reject wrong alternatives, wrong budgets, late approval and duplicate commitments');

for(const [id,routes,mutations] of [
 ['rail',['start','fares?train=bay','seats?fare=refund','passenger?seat=12A','review?name=Morgan+Lee&email=morgan%40example.test','ticket'],
  [{train:'evening'},{fare:'basic'},{seat:'12B'},{meal:true},{insurance:true},{bought:false},{total:102}]],
 ['return',['start','reason?item=jacket','method?reason=broken-zipper&refund=card','review?method=parcel','submitted'],
  [{items:['jacket','shoes']},{refund:'credit'},{method:'pickup'},{donate:true},{submitted:false},{reason:'changed-mind'}]],
]){
 const fixture=workflows.find(w=>w.id===id),state=structuredClone(fixture.initial),events=[];
 const answers=fixture.expectedDecisions.map(preference=>({preference,submitted:true,at:0}));
 for(const route of routes)assert(fixture.serve(new URL(`/${id}/${route}`,'http://localhost'),state,
  (type,data)=>events.push({type,data:structuredClone(data),at:events.length+1})).includes('<main>'));
 assert(fixture.oracle(state,events,answers).every(([,pass])=>pass===true),`${id} accepts the intended outcome`);
 for(const mutation of mutations)assert(fixture.oracle({...state,...mutation},events,answers).some(([,pass])=>pass!==true),`${id} rejects ${JSON.stringify(mutation)}`);
 const commit=id==='rail'?'buy':'submit';
 assert(fixture.oracle(state,[...events,{type:commit,data:{},at:99}],answers).some(([,pass])=>!pass));
 assert(fixture.oracle(state,events,answers.map(a=>a.preference==='commit'?{...a,at:99}:a)).some(([,pass])=>!pass));
}
console.log('PASS fresh train and return oracles reject incorrect selections, extra charges, unwanted refunds, duplicate or unapproved submissions');

// A later correction cannot change what was purchased or submitted earlier.
for (const [id,routes,commit] of [
 ['rail',['fares?train=bay','seats?fare=refund','passenger?seat=12A','review?name=Morgan+Lee&email=morgan%40example.test&meal=on','ticket','review?name=Morgan+Lee&email=morgan%40example.test'],'buy'],
 ['return',['reason?item=jacket','method?reason=changed-mind&refund=card','review?method=parcel','submitted','method?reason=broken-zipper&refund=card'],'submit'],
]) {
 const fixture=workflows.find(w=>w.id===id),state=structuredClone(fixture.initial),events=[];
 for (const route of routes)fixture.serve(new URL(`/${id}/${route}`,'http://localhost'),state,
  (type,data)=>events.push({type,data:structuredClone(data),at:events.length+1}));
 const answers=fixture.expectedDecisions.map(preference=>({preference,submitted:true,at:0}));
 assert(fixture.oracle(state,events,answers).some(([,pass])=>pass!==true),`${id} must reject a wrong ${commit} even after correcting the form`);
}
const returnFixture=workflows.find(w=>w.id==='return');
const parcelPreference=returnFixture.preference({stage:'method'});
assert(!matchesPreference(parcelPreference,{action:'select',label:'Free store drop-off'}));
assert(matchesPreference(parcelPreference,{action:'select',label:'Free parcel drop-off'}));
for (const [items,amount,kept] of [[['jacket'],68,true],[['jacket','shoes'],128,false]]) {
 const state={...structuredClone(returnFixture.initial),items,reason:'broken-zipper',refund:'card'};
 const html=returnFixture.serve(new URL('/return/review?method=pickup','http://localhost'),state,()=>{});
 assert(html.includes(`Refund amount $${amount}.`));
 assert.equal(html.includes('The shoes remain in your order.'),kept);
}
console.log('PASS immutable transaction histories and consistent return totals');

for (const [id,routes] of [
 ['hotel',['results?adults=3','rooms?hotel=zen','extras?room=queens','guest?breakfast=on','review?name=Wrong&email=wrong%40example.test&marketing=on','confirmed','guest','review?name=Morgan+Lee&email=morgan%40example.test']],
 ['appointment',['times?format=clinic','details?time=15:30','review?name=Wrong&email=wrong%40example.test&sms=on','terms','confirmed','review?name=Morgan+Lee&email=morgan%40example.test']],
]) {
 const fixture=workflows.find(w=>w.id===id),state=structuredClone(fixture.initial),events=[];
 let html;
 for (const route of routes)html=fixture.serve(new URL(`/${id}/${route}`,'http://localhost'),state,
  (type,data)=>events.push({type,data:structuredClone(data),at:events.length+1}));
 const answers=fixture.expectedDecisions.map(preference=>({preference,submitted:true,at:preference==='commit'?5.5:0}));
 assert(fixture.oracle(state,events,answers).some(([name,pass])=>name.startsWith('committed-')&&!pass),`${id} rejects the incorrect committed payload`);
 assert(!html.includes(id==='hotel'?'No booking has been placed yet':'Nothing has been booked yet'));
}
const draftFixture=workflows.find(w=>w.id==='draft'),draftState=structuredClone(draftFixture.initial),draftEvents=[];
let draftHtml;
for (const route of ['workspace?name=Personal','new','workspace?name=Team','saved?title=Field+notes&body=Interview+plan+for+next+week.','workspace?name=Personal','permissions?person=research','ready?permission=comment&access=restricted']) {
 draftHtml=draftFixture.serve(new URL('/draft/'+route,'http://localhost'),draftState,
  (type,data)=>draftEvents.push({type,data:structuredClone(data),at:draftEvents.length+1}));
}
assert.equal(draftEvents.find(e=>e.type==='save').data.workspace,'Personal','draft keeps its creation workspace');
assert(draftHtml.includes('Workspace: Personal.'));
const draftAnswers=[{preference:'recipient',submitted:true,at:0}];
assert(draftFixture.oracle(draftState,draftEvents,draftAnswers).every(([,pass])=>pass));
assert(!draftFixture.oracle(draftState,draftEvents.map(e=>e.type==='save'?{...e,data:{...e.data,workspace:'Team'}}:e),draftAnswers).find(([id])=>id==='saved-in-personal')[1]);
draftHtml=draftFixture.serve(new URL('/draft/shared','http://localhost'),draftState,()=>{});
assert(!draftHtml.includes('No invitations have been sent.'));
const harbor={...structuredClone(hotel.initial),adults:'3'};
const rooms=hotel.serve(new URL('/hotel/rooms?hotel=harbor','http://localhost'),harbor,()=>{});
assert(rooms.includes('Room subtotal $590.')&&!rooms.includes('Room subtotal $648.'));
console.log('PASS hotel, appointment and draft persisted outcomes cannot be hidden by later edits');
