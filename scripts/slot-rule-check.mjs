import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const KEY='crsc-demo-v7';
const d=new Date(); d.setDate(d.getDate()+((6-d.getDay()+7)%7));
const DATE=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const L=(id,sess,sport,label)=>({id,sessionId:sess,sport,label,cap:20,level:sport==='volleyball'?2:undefined,priceE:8,priceC:10,teamCount:0});
const fixture={settings:{},players:{},removals:[],payments:[],
  events:[{id:'ev',title:'S',date:DATE,status:'open',location:'X',
    sessions:[{id:'s1',label:'5:30 – 7:30 PM'},{id:'s2',label:'7:30 – 9:30 PM'}],
    lists:[ L('v1','s1','volleyball','Advanced'), L('v2','s1','volleyball','Advanced +'),
            L('b1','s1','basketball','Mixed'),    L('f1','s1','football','5v5'),
            L('v3','s2','volleyball','Advanced'), L('b2','s2','basketball','Mixed') ],
    bundles:[{sport:'volleyball',label:'Volleyball 4h (both time slots)',priceE:15,priceC:15}],createdAt:1}],
  signups:{'ev':[]}};

/*
 * The club's rule, in its own words: you may play 5:30 and 7:30, any sports;
 * you may not take two lists in the same hour, whatever sports they are.
 * Run against a local server on :8099 serving public/.
 */
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
async function fresh(){
  const ctx=await b.newContext(); const pg=await ctx.newPage();
  await pg.route('**/firebase-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.FIREBASE_CONFIG=null;window.MAILER=null;'}));
  await pg.addInitScript(({KEY,fixture})=>{
    localStorage.setItem(KEY,JSON.stringify(fixture));
    localStorage.setItem('crsc-device-id','dMe');
    localStorage.setItem('crsc-profile',JSON.stringify({name:'T',email:'t@x.com',phone:'',insta:'',deviceId:'dMe'}));
  },{KEY,fixture});
  await pg.goto('http://localhost:8099/#/event/ev',{waitUntil:'networkidle'});
  await pg.waitForTimeout(1100);
  await pg.evaluate(()=>document.querySelector('[data-join]').click());
  await pg.waitForTimeout(400);
  await pg.evaluate(()=>document.querySelectorAll('input[data-list]').forEach(i=>{if(i.checked)i.click();}));
  await pg.waitForTimeout(200);
  return pg;
}
const checked = pg => pg.evaluate(()=>[...document.querySelectorAll('input[data-list]')].filter(i=>i.checked).map(i=>i.dataset.list));

async function tick(pg, ids){ for(const id of ids){ await pg.evaluate(i=>document.querySelector(`input[data-list="${i}"]`).click(), id); await pg.waitForTimeout(200);} }

const cases = [
  ['5:30 volleyball + 7:30 volleyball', ['v1','v3'], 2, 'ALLOWED'],
  ['5:30 basketball + 7:30 volleyball', ['b1','v3'], 2, 'ALLOWED'],
  ['5:30 football  + 7:30 basketball',  ['f1','b2'], 2, 'ALLOWED'],
  ['volleyball TWICE at 5:30',          ['v1','v2'], 1, 'BLOCKED'],
  ['basketball + volleyball at 5:30',   ['b1','v1'], 1, 'BLOCKED'],
  ['football + basketball at 5:30',     ['f1','b1'], 1, 'BLOCKED'],
];
let bad = 0;
for(const [label, ids, want, kind] of cases){
  const pg = await fresh();
  await tick(pg, ids);
  const got = await checked(pg);
  const ok = got.length === want;
  if(!ok) bad++;
  console.log((ok?'ok  ':'FAIL') + '  ' + kind.padEnd(8) + label.padEnd(36) + '→ kept ' + JSON.stringify(got));
  await pg.context().close();
}
await b.close();
console.log('\n' + (bad ? bad + ' failing' : 'all ' + cases.length + ' combinations behave as the club described'));
process.exit(bad ? 1 : 0);
