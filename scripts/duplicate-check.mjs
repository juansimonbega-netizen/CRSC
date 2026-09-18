import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const KEY='crsc-demo-v7';
const d=new Date(); d.setDate(d.getDate()+((6-d.getDay()+7)%7));
const DATE=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const V=(id,sess,label)=>({id,sessionId:sess,sport:'volleyball',label,cap:20,level:2,priceE:8,priceC:10,teamCount:0});
// Giulio is ALREADY on the list, signed up from a DIFFERENT device id —
// exactly the live situation: one human, two profiles, same email.
const fixture={ settings:{}, players:{}, removals:[], payments:[],
  events:[{id:'ev',title:'S',date:DATE,status:'open',location:'X',
    sessions:[{id:'s1',label:'5:30 – 7:30 PM'},{id:'s2',label:'7:30 – 9:30 PM'}],
    lists:[V('v1','s1','Advanced'),V('v2','s1','Advanced +'),V('v3','s2','Advanced')],
    bundles:[],createdAt:1}],
  signups:{'ev':[{id:'old',listId:'v1',name:'Giulio Graziani',email:'ggraziani991@gmail.com',
    method:'etransfer',deviceId:'dev_OLD_PHONE',paid:false,checkedIn:false,order:1,createdAt:1}]} };

/*
 * The live defect this guards against: one human with two profiles on the
 * same email, so every device-keyed check failed open and the same name
 * landed on one list repeatedly. Run against a local server on :8099.
 */
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const pg=await b.newPage({viewport:{width:430,height:1000}});
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.route('**/firebase-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.FIREBASE_CONFIG=null;window.MAILER=null;'}));
await pg.addInitScript(({KEY,fixture})=>{
  if(!localStorage.getItem(KEY)) localStorage.setItem(KEY,JSON.stringify(fixture));
  localStorage.setItem('crsc-device-id','dev_NEW_PHONE');   // second profile
  localStorage.setItem('crsc-profile',JSON.stringify({name:'Giulio Graziani',email:'ggraziani991@gmail.com',phone:'',insta:'',deviceId:'dev_NEW_PHONE'}));
},{KEY,fixture});
await pg.goto('http://localhost:8099/#/event/ev',{waitUntil:'networkidle'});
await pg.waitForTimeout(1300);

console.log('Same human, second device/profile, already on v1 (5:30).');
console.log('  "your spots" recognises him:', await pg.evaluate(()=>!!document.querySelector('.my-spots')), '← was false before this fix');
await pg.evaluate(()=>document.querySelector('[data-join]')?.click());
await pg.waitForTimeout(500);
const rows = await pg.evaluate(()=>[...document.querySelectorAll('.join-list')].map(el=>({
  t: el.querySelector('.grow').textContent.trim(), locked: el.querySelector('input').disabled,
  note: el.querySelector('.chip,.btn')?.textContent.trim()||'' })));
console.log('  join sheet offers:');
rows.forEach(r=>console.log('    '+(r.locked?'🔒':'✅')+' '+r.t.padEnd(26)+r.note));

// Hammer the confirm button: a double tap must not make two rows.
await pg.evaluate(()=>{ const i=document.querySelector('input[data-list="v3"]'); if(!i.checked) i.click(); });
await pg.waitForTimeout(200);
await pg.evaluate(()=>{ const b=document.querySelector('#join-confirm'); b.click(); b.click(); b.click(); });
await pg.waitForTimeout(1200);
const after = await pg.evaluate((K)=>JSON.parse(localStorage.getItem(K)).signups['ev'].map(s=>s.listId), KEY);
console.log('\n  after tapping confirm 3× fast →', JSON.stringify(after), after.length===2?'✓ one new row only':'⚠ duplicated');
console.log('errors:', errs.length?errs:'none');
const ok = after.length === 2 && !errs.length;
await b.close();
process.exit(ok ? 0 : 1);
