const assert=require('node:assert/strict');
const E=require('../engine.js');
const approx=(a,b,tol=.0001)=>assert.ok(Math.abs(a-b)<tol,`${a} ≠ ${b}`);
approx(E.ema([1,2,3,4,5],5),3);
assert.equal(E.ema([1,2,3],5),null);
assert.equal(E.rsi(Array.from({length:16},()=>10)),50);
assert.equal(E.rsi(Array.from({length:16},(_,i)=>10+i)),100);
const p=E.positionFor({avg:40,qty:100},{price:30});
assert.equal(p.pnl,-1000);assert.equal(p.percentage,-25);
const p0=E.positionFor({avg:40,qty:100},null);assert.equal(p0.pnl,null);
const pf=E.calculatePaper([
 {status:'filled',side:'buy',symbol:'2222',qty:100,price:10,fee:1.6,executedAt:'2026-01-01T10:00:00Z'},
 {status:'filled',side:'sell',symbol:'2222',qty:40,price:12,fee:.768,executedAt:'2026-01-02T10:00:00Z'}
],{'2222':{price:11}},5000);
approx(pf.cash,4477.632);
approx(pf.realized,78.592);
approx(pf.holdings['2222'].qty,60);
approx(pf.equity,5137.632);
const missing=E.calculatePaper([{status:'filled',side:'buy',symbol:'2222',qty:10,price:10,fee:0,executedAt:'2026-01-01T10:00:00Z'}],{},5000);
assert.equal(missing.equity,null);
const stock={symbol:'2222',avg:25,qty:10,pe:'',growth:'',debt:''};
assert.equal(E.analyze(stock,[],Date.now()).status,'لا توجد بيانات');
const snapshots=Array.from({length:18},(_,i)=>({symbol:'2222',price:10+i/10,time:new Date(Date.UTC(2026,0,1+Math.floor(i/5),7+i%5)).toISOString()}));
const a=E.analyze(stock,snapshots,Date.parse(snapshots.at(-1).time)+60000);
assert.ok(a.readings===18&&a.rsi!==undefined);
assert.equal(E.quantityRisk(10000,100,98,.5,20),20);
console.log('✓ 11 engine assertions passed');
