'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function run() {
  const script = fs.readFileSync(path.join(__dirname, '..', 'worker', 'index.js'), 'utf8');
  const worker = (await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(script))).default;
  const env = {
    SAHMK_API_KEY: 'test-server-key',
    APP_ACCESS_TOKEN: 'test-private-app-token',
    ALLOWED_ORIGIN: 'https://drburghash-sys.github.io'
  };
  const request = (pathName, token=env.APP_ACCESS_TOKEN, origin=env.ALLOWED_ORIGIN) =>
    new Request('https://example.workers.dev' + pathName, {
      headers: {'Origin': origin, 'X-App-Token': token}
    });
  const originalFetch = global.fetch;
  let calls=0;
  try {
    global.fetch = async (url, opts) => {
      calls++;
      assert.match(url, /quote\/2222\/\?data_mode=delayed/);
      assert.equal(opts.headers['X-API-Key'], env.SAHMK_API_KEY);
      return new Response(JSON.stringify({
        symbol:'2222',name:'أرامكو السعودية',price:26.5,
        updated_at:'2026-11-06T10:45:00+03:00',is_delayed:true
      }), {status:200,headers:{'Content-Type':'application/json'}});
    };
    let res=await worker.fetch(request('/quote?symbol=2222'),env);
    assert.equal(res.status,200);
    let value=await res.json();
    assert.equal(value.symbol,'2222');
    assert.equal(value.price,26.5);
    assert.equal(value.is_delayed,true);
    assert.equal(calls,1);
    res=await worker.fetch(request('/quote?symbol=2222','incorrect'),env);
    assert.equal(res.status,401);
    res=await worker.fetch(request('/quote?symbol=2222',env.APP_ACCESS_TOKEN,'https://evil.invalid'),env);
    assert.equal(res.status,403);
    res=await worker.fetch(request('/quote?symbol=abc'),env);
    assert.equal(res.status,400);
    res=await worker.fetch(request('/health'),env);
    assert.equal(res.status,200);
    value=await res.json();
    assert.equal(value.upstream_verified,false);
    assert.equal(calls,1);
    res=await worker.fetch(request('/quote?symbol=2222'),{...env,SAHMK_API_KEY:''});
    assert.equal(res.status,503);
    global.fetch=async()=>new Response(JSON.stringify({error:{message:'Daily quota exceeded'}}),{status:429});
    res=await worker.fetch(request('/quote?symbol=2222'),env);
    assert.equal(res.status,429);
    assert.match((await res.json()).error,/Daily quota exceeded/);
    global.fetch=async()=>{throw Error('network down')};
    res=await worker.fetch(request('/quote?symbol=2222'),env);
    assert.equal(res.status,502);
    console.log('✓ Worker origin, token, quote, health, validation, quota and failure tests passed');
  } finally {
    global.fetch=originalFetch;
  }
}
run().catch(e=>{console.error(e);process.exitCode=1});
