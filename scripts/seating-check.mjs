import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const KEY='crsc-demo-v7';
const d=new Date(); d.setDate(d.getDate()+((6-d.getDay()+7)%7));
const DATE=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const V=(id,sess,label)=>({id,sessionId:sess,sport:'volleyball',label,cap:21,level:4,priceE:8,priceC:10,teamCount:3});
const seats=[{sport:'volleyball',sessionId:'s1',label:'Advanced +'},{sport:'volleyball',sessionId:'s2',label:'Adv + Men'}];
const fixture={ settings:{}, removals:[], payments:[],
  // Giulio registered twice — both records carry the pass and its seats.
  players:{
    dA:{deviceId:'dA',name:'Giulio Graziani',email:'ggraziani991@gmail.com',battlePass:'4h',passLists:seats,level:4},
    dB:{deviceId:'dB',name:'Giulio Graziani',email:'ggraziani991@gmail.com',battlePass:'4h',passLists:seats,level:4},
    dR:{deviceId:'dR',name:'Rayan',email:'rayansedraoui10@gmail.com',battlePass:'4h',passLists:seats,level:4},
  },
  events:[{id:'ev',title:'S',date:DATE,status:'open',location:'X',
    sessions:[{id:'s1',label:'5:30 – 7:30 PM'},{id:'s2',label:'7:30 – 9:30 PM'}],
    lists:[V('v1','s1','Advanced +'), V('v2','s2','Adv + Men')],
    bundles:[],createdAt:1}],
  signups:{'ev':[]} };

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const pg=await b.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.route('**/firebase-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.FIREBASE_CONFIG=null;window.MAILER=null;'}));
await pg.addInitScript(({KEY,fixture})=>{
  if(!localStorage.getItem(KEY)) localStorage.setItem(KEY,JSON.stringify(fixture));
  localStorage.setItem('crsc-profile',JSON.stringify({name:'Exec',email:'e@x.com',deviceId:'dExec'}));
  sessionStorage.setItem('crsc-exec','1');
},{KEY,fixture});

const count = () => pg.evaluate((K)=>{
  const st=JSON.parse(localStorage.getItem(K));
  const c={}; for(const s of st.signups['ev']||[]) c[s.name+' @'+s.listId]=(c[s.name+' @'+s.listId]||0)+1;
  return { total:(st.signups['ev']||[]).length, byRow:c };
}, KEY);

await pg.goto('http://localhost:8099/#/event/ev',{waitUntil:'networkidle'});
await pg.waitForTimeout(2000);
console.log('after first open      :', JSON.stringify(await count()));

// Hammer it: re-render repeatedly, the way the live loop did.
for (let i=0;i<5;i++){ await pg.evaluate(()=>location.hash='#/'); await pg.waitForTimeout(250);
                       await pg.evaluate(()=>location.hash='#/event/ev'); await pg.waitForTimeout(450); }
console.log('after 5 more renders  :', JSON.stringify(await count()));

// And a full reload, which clears the once-per-page guard.
await pg.reload({waitUntil:'networkidle'}); await pg.waitForTimeout(2200);
console.log('after a full reload   :', JSON.stringify(await count()));
// Two pass holders, two slots each. Giulio has two profiles and must still
// get exactly one seat per slot, no matter how many times the page renders.
const c = await count();
const ok = c.total === 4 && Object.values(c.byRow).every(n => n === 1) && !errs.length;
console.log('errors:', errs.length?errs:'none');
console.log('\n' + (ok ? 'each pass holder seated once per slot, and it stays that way'
                        : 'FAILED — seats multiplied'));
await b.close();
process.exit(ok ? 0 : 1);
