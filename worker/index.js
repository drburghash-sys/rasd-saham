/**
 * راصد تداول — وسيط Cloudflare Worker للقراءات المؤجلة
 * Required secrets: SAHMK_API_KEY, APP_ACCESS_TOKEN
 * Optional variable: ALLOWED_ORIGIN (exact site origin, e.g. https://USERNAME.github.io)
 * Do not set SAHMK_API_KEY in client code or in a public GitHub repository.
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGIN || '').replace(/\/$/, '');
    const originOk = !allowed || !origin || origin === allowed;
    const cors = {
      'Access-Control-Allow-Origin': allowed || '*',
      'Access-Control-Allow-Headers': 'X-App-Token,Content-Type',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Vary': 'Origin',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    };
    const reply = (obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:cors});
    if (!originOk) return reply({error:'المصدر غير مسموح'},403);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
    if (request.method !== 'GET') return reply({error:'الطريقة غير مدعومة'},405);
    if (!env.APP_ACCESS_TOKEN || !env.SAHMK_API_KEY) return reply({error:'المفاتيح لم تُضبط على الخادم'},503);
    const sent = request.headers.get('X-App-Token') || '';
    // Timing-safe comparison is not needed for an instructional rate-limited Worker, but never log tokens.
    if(sent.length!==env.APP_ACCESS_TOKEN.length || sent!==env.APP_ACCESS_TOKEN) return reply({error:'رمز الدخول غير صحيح'},401);
    const u = new URL(request.url);
    if(u.pathname!=='/quote'&&u.pathname!=='/quote/')return reply({error:'المسار غير معروف'},404);
    const symbol=(u.searchParams.get('symbol')||'').trim();
    if(!/^\d{4,6}$/.test(symbol))return reply({error:'رمز السهم غير صالح'},400);
    try {
      const upstream = await fetch(`https://api.sahmk.sa/api/v1/quote/${encodeURIComponent(symbol)}/?data_mode=delayed`,{
        method:'GET',headers:{'X-API-Key':env.SAHMK_API_KEY,'Accept':'application/json'},
        signal:AbortSignal.timeout(12000),cf:{cacheTtl:0,cacheEverything:false}
      });
      const body=await upstream.json();
      if(!upstream.ok)return reply({error:body?.error?.message||'مزود الأسعار لم يُرجع بيانات',upstream_status:upstream.status},upstream.status===429?429:502);
      const data=body?.data||body;
      const price=Number(data?.price),updatedAt=data?.updated_at;
      if(!(price>0)||!updatedAt||!Number.isFinite(Date.parse(updatedAt)))return reply({error:'لا توجد قراءة سعر صالحة أو توقيت محدد'},503);
      if(String(data.symbol||symbol)!==symbol)return reply({error:'رمز السهم المستلم مختلف'},502);
      return reply({symbol,name:String(data.name||''),price,updated_at:updatedAt,is_delayed:Boolean(data.is_delayed??true),change_percent:data.change_percent??null});
    }catch(err){return reply({error:'تعذّر الاتصال بالمزود أو انتهت المهلة'},502)}
  }
};
