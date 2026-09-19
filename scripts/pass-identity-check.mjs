import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const KEY='crsc-demo-v7';
const d=new Date(); d.setDate(d.getDate()+((6-d.getDay()+7)%7));
const DATE=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const V=(id,sess,label)=>({id,sessionId:sess,sport:'volleyball',label,cap:20,level:2,priceE:8,priceC:10,teamCount:0});
const fixture={ settings:{}, removals:[], payments:[],
  // Rayan registered twice. The pass sits on the OLD profile; his sign-ups
  // were made from the NEW one. Exactly the live situation.
  players:{
    dOld:{deviceId:'dOld',name:'Rayan',email:'rayansedraoui@gmail.com',battlePass:'4h',level:4},
    dNew:{deviceId:'dNew',name:'Rayan',email:'rayansedraoui@gmail.com'},
  },
  events:[{id:'ev',title:'S',date:DATE,status:'open',location:'X',
    sessions:[{id:'s1',label:'5:30 – 7:30 PM'},{id:'s2',label:'7:30 – 9:30 PM'}],
    lists:[V('v1','s1','Advanced'), V('v2','s2','Advanced'),
           {id:'b1',sessionId:'s1',sport:'basketball',label:'Men',cap:12,priceE:10,priceC:10,teamCount:0}],
    bundles:[{sport:'volleyball',label:'Volleyball 4h (both time slots)',priceE:15,priceC:15}],createdAt:1}],
  signups:{'ev':[
    {id:'a',listId:'v1',name:'Rayan',email:'rayansedraoui@gmail.com',method:'etransfer',deviceId:'dNew',paid:false,checkedIn:false,order:1,createdAt:1},
    {id:'b',listId:'v2',name:'Rayan',email:'rayansedraoui@gmail.com',method:'etransfer',deviceId:'dNew',paid:false,checkedIn:false,order:2,createdAt:2},
  ]} };

/*
 * A season pass must follow the player, not the phone. Guards the case that
 * broke in the wild: two profiles on one email, the pass on one of them, the
 * sign-ups made from the other. Run against a local server on :8099.
 */
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const pg=await b.newPage({viewport:{width:900,height:1000}});
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.route('**/firebase-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.FIREBASE_CONFIG=null;window.MAILER=null;'}));
await pg.addInitScript(({KEY,fixture})=>{
  if(!localStorage.getItem(KEY)) localStorage.setItem(KEY,JSON.stringify(fixture));
  localStorage.setItem('crsc-profile',JSON.stringify({name:'Exec',email:'e@x.com',deviceId:'dExec'}));
  sessionStorage.setItem('crsc-exec','1');
},{KEY,fixture});
await pg.goto('http://localhost:8099/#/event/ev',{waitUntil:'networkidle'});
await pg.waitForTimeout(1400);
console.log('Pass is on profile A; sign-ups were made from profile B.\n');
console.log('roster:');
for(const r of await pg.evaluate(()=>[...document.querySelectorAll('.entries .entry')].map(e=>e.textContent.replace(/\s+/g,' ').trim()))) console.log('   ', r);
await pg.click('#btn-summary'); await pg.waitForTimeout(600);
console.log('\npayments screen:', await pg.evaluate(()=>[...document.querySelectorAll('.stat')].map(e=>e.textContent.replace(/\s+/g,' ').trim())));
const rows = await pg.evaluate(()=>[...document.querySelectorAll('.entries .entry')].map(e=>e.textContent));
const ok = rows.length === 2 && rows.every(r=>/PASS 4H/.test(r)) && !errs.length;
console.log('errors:', errs.length?errs:'none');
console.log(ok ? '\npass follows the player across profiles' : '\nFAILED');
await b.close();
process.exit(ok ? 0 : 1);
