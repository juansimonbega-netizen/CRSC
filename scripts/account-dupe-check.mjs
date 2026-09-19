import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const KEY='crsc-demo-v7';
const d=new Date(); d.setDate(d.getDate()+((6-d.getDay()+7)%7));
const DATE=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
// Giulio already has a profile. A new visitor types his email.
const fixture={ settings:{}, removals:[], payments:[],
  players:{ dG:{deviceId:'dG',name:'Giulio Graziani',email:'ggraziani991@gmail.com',battlePass:'4h',level:4,passLists:[]} },
  events:[{id:'ev',title:'S',date:DATE,status:'open',location:'X',
    sessions:[{id:'s2',label:'7:30 – 9:30 PM'}],
    lists:[{id:'v1',sessionId:'s2',sport:'volleyball',label:'Advanced',cap:20,level:2,priceE:8,priceC:10,teamCount:0}],
    bundles:[],createdAt:1}],
  signups:{'ev':[]} };

/*
 * One profile per email. A second registration on an address the club
 * already knows must be refused and routed to "I already have a profile",
 * which picks the existing account up on this device. Run against a local
 * server on :8099.
 */
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const pg=await b.newPage({viewport:{width:430,height:900}});
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.route('**/firebase-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.FIREBASE_CONFIG=null;window.MAILER=null;'}));
await pg.addInitScript(({KEY,fixture})=>{
  // Seed once: this script re-runs on every navigation, and overwriting the
  // device id would undo exactly what the restore flow is meant to change.
  if (!localStorage.getItem(KEY)) {
    localStorage.setItem(KEY,JSON.stringify(fixture));
    localStorage.setItem('crsc-device-id','dNEW');   // a fresh device, no profile
  }
},{KEY,fixture});
await pg.goto('http://localhost:8099/#/',{waitUntil:'networkidle'});
await pg.waitForTimeout(1200);
console.log('A) new visitor sees the registration gate:', await pg.evaluate(()=>!!document.querySelector('#welcome-save')));
await pg.fill('#pf-name','Giulio Graziani');
await pg.fill('#pf-email','GGraziani991@GMAIL.com');    // same address, different case
await pg.click('#welcome-save');
await pg.waitForTimeout(700);
console.log('B) blocked with        :', await pg.evaluate(()=>document.querySelector('.modal-body h2')?.textContent.trim()));
console.log('   message             :', await pg.evaluate(()=>document.querySelector('.modal-body .hint')?.textContent.trim().slice(0,90)+'…'));
console.log('   buttons             :', await pg.evaluate(()=>[...document.querySelectorAll('.modal-body .btn')].map(b=>b.textContent.trim())));
console.log('   profile created?    :', await pg.evaluate(()=>!!localStorage.getItem('crsc-profile')), '← must be false');
// Take the offered route.
await pg.evaluate(()=>document.querySelector('#dup-restore').click());
await pg.waitForTimeout(600);
console.log('\nC) restore sheet opens :', await pg.evaluate(()=>document.querySelector('.modal-body h2')?.textContent.trim()));
console.log('   email pre-filled    :', await pg.evaluate(()=>document.querySelector('#rs-email')?.value));
await pg.evaluate(()=>document.querySelector('#rs-go').click());
await pg.waitForTimeout(1200);
const got = await pg.evaluate(()=>({ prof: JSON.parse(localStorage.getItem('crsc-profile')||'null'), dev: localStorage.getItem('crsc-device-id') }));
console.log('   picked up profile   :', got.prof?.name, '| device now:', got.dev, got.dev==='dG'?'✓ the existing account':'⚠');
const ok = got.dev === 'dG' && got.prof?.name === 'Giulio Graziani' && !errs.length;
console.log('\nerrors:', errs.length?errs:'none');
console.log(ok ? '\nduplicate account refused, existing profile picked up' : '\nFAILED');
await b.close();
process.exit(ok ? 0 : 1);
