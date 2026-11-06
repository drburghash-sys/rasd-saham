(function (root) {
  'use strict';
  const FINITE = n => Number.isFinite(Number(n));
  const round = (n, d = 4) => Number(Number(n).toFixed(d));
  function ema(values, period) {
    if (values.length < period) return null;
    const factor = 2 / (period + 1);
    let out = values.slice(0, period).reduce((a,b)=>a+b,0) / period;
    for (const v of values.slice(period)) out = v * factor + out * (1 - factor);
    return out;
  }
  function rsi(values, period = 14) {
    if (values.length < period + 1) return null;
    let gain = 0, loss = 0;
    for (let i=1;i<=period;i++) {
      const delta = values[i]-values[i-1];
      gain += Math.max(0,delta); loss += Math.max(0,-delta);
    }
    gain/=period; loss/=period;
    for (let i=period+1;i<values.length;i++) {
      const delta = values[i]-values[i-1];
      gain=(gain*(period-1)+Math.max(0,delta))/period;
      loss=(loss*(period-1)+Math.max(0,-delta))/period;
    }
    if (loss===0) return gain===0?50:100;
    return 100 - 100/(1+gain/loss);
  }
  function financial(stock) {
    let checked=0, score=0, reasons=[];
    if (FINITE(stock.pe) && stock.pe!=='') {
      checked++; const ok=Number(stock.pe)>0 && Number(stock.pe)<=30;
      score+=ok?1:-1; reasons.push(`مكرر الربحية: ${stock.pe} (مقياس مبسط، يختلف بين القطاعات)`);
    }
    if (FINITE(stock.growth) && stock.growth!=='') {
      checked++; const ok=Number(stock.growth)>=0;
      score+=ok?1:-1; reasons.push(`نمو الأرباح المُدخل: ${stock.growth}%`);
    }
    if (FINITE(stock.debt) && stock.debt!=='') {
      checked++; const ok=Number(stock.debt)<=1;
      score+=ok?1:-1; reasons.push(`الديون/حقوق الملكية المُدخلة: ${stock.debt}`);
    }
    let status = checked<2 ? 'غير كافٍ' : score>0 ? 'مقبول مبدئيًا' : score<0 ? 'يحتاج حذرًا' : 'مختلط';
    return { status, checked, score, reasons };
  }
  function analyze(stock, snapshots, now=Date.now()) {
    const items = snapshots.filter(x=>x.symbol===stock.symbol && Number(x.price)>0 && Number.isFinite(Date.parse(x.time))).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
    const prices=items.map(x=>Number(x.price)); const last=items.at(-1);
    const f=financial(stock);
    if (!last) return {status:'لا توجد بيانات',tone:'muted',reasons:['أدخل أول سعر أو اربط مصدر بيانات مؤجلة.'],readings:0,fin:f};
    const age = now-Date.parse(last.time);
    const stale=age>90*60*1000;
    if(prices.length<16) return {status:'جمع بيانات',tone:'muted',reasons:[`القراءات: ${prices.length} من 16 قراءة مبدئية على الأقل.`,`لا يكفي سعر واحد لإنتاج تحليل فني موثوق.`],readings:prices.length,stale,fin:f,last};
    const e5=ema(prices,5),e10=ema(prices,10),r=rsi(prices,14);
    const previous5=ema(prices.slice(0,-1),5), previous10=ema(prices.slice(0,-1),10);
    const recent=items.slice(-16).map(x=>Date.parse(x.time));
    const distinctDates=new Set(items.slice(-16).map(x=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x.time))));
    // A single quote per hour is not a complete OHLCV candle. These are tentative trend signals only.
    const hasVariation=recent.filter((x,i)=>i>0 && x-recent[i-1]>=30*60*1000).length>=12;
    let status='انتظار',tone='neutral'; const reasons=[];
    if(!hasVariation || distinctDates.size<2) {
      status='جمع بيانات'; tone='muted'; reasons.push('نحتاج قراءات موزعة على أكثر من يوم وبفواصل زمنية مناسبة؛ لا تكفي نقاط متقاربة أو مُكررة.');
    } else if(stale) {
      status='بيانات قديمة';tone='muted';reasons.push('آخر سعر قديم نسبيًا؛ الإشارات معلقة حتى وصول قراءة جديدة.');
    } else if(e5>e10 && r>=50 && r<=70 && prices.at(-1)>e5) {
      status=previous5<=previous10?'تقاطع صاعد تجريبي':'اتجاه صاعد للمراقبة';tone='positive';
      reasons.push('متوسط 5 قراءات أعلى من متوسط 10 قراءات.','الزخم إيجابي دون تشبع شراء حاد.');
    } else if(e5<e10 && r<45) {
      status='تحذير اتجاه هابط';tone='negative';
      reasons.push('متوسط 5 قراءات دون متوسط 10 قراءات.','الزخم ضعيف؛ لا تعالج الخسارة بالشراء العشوائي.');
    } else if(r>72) {
      status='زخم مرتفع — حذر';tone='warning'; reasons.push('مؤشر RSI مرتفع، وقد يتبع الارتفاع تصحيح.');
    } else {
      reasons.push('شروط اتجاه واضح غير مكتملة؛ لا توجد إشارة دخول.');
    }
    if(f.status==='يحتاج حذرًا') reasons.push('المؤشرات المالية اليدوية تتطلب مراجعة مستقلة.');
    reasons.push('التحليل مبني على نقاط سعرية متباعدة، وليس شموعًا ساعة مكتملة أو توصية تداول.');
    return {status,tone,reasons,readings:prices.length,stale,e5,rsi:r,e10,last,fin:f};
  }
  function calculatePaper(trades, quotes, initialCash=50000) {
    let cash=Number(initialCash), realized=0; const holdings={}, audit=[];
    for(const trade of [...trades].filter(t=>t.status==='filled').sort((a,b)=>a.executedAt.localeCompare(b.executedAt))){
      const q=Number(trade.qty),price=Number(trade.price),fee=Number(trade.fee);
      const pos=holdings[trade.symbol]||{qty:0,cost:0};
      if(trade.side==='buy') { pos.qty+=q;pos.cost+=q*price+fee; cash-=q*price+fee; }
      else if(trade.side==='sell' && pos.qty>=q && q>0){
        const basis=(pos.cost/pos.qty)*q;
        pos.qty-=q;pos.cost=Math.max(0,pos.cost-basis);cash+=q*price-fee;realized+=q*price-fee-basis;
      } else { audit.push(`صفقة غير متسقة: ${trade.id}`); }
      holdings[trade.symbol]=pos;
    }
    let marketValue=0;let missing=[];
    Object.keys(holdings).forEach(symbol=>{
      if(holdings[symbol].qty>0){
        if(!quotes[symbol] || !(quotes[symbol].price>0)) missing.push(symbol);
        else marketValue+=holdings[symbol].qty*Number(quotes[symbol].price);
      }
    });
    return {cash,realized,marketValue,holdings,missing,equity:missing.length?null:cash+marketValue,pnl:missing.length?null:cash+marketValue-initialCash,audit};
  }
  function positionFor(stock,quote) {
    const cost=Number(stock.avg)*Number(stock.qty);
    if(!quote||!(Number(quote.price)>0)) return {cost,value:null,pnl:null,percentage:null,breakEven:Number(stock.avg)};
    const value=Number(quote.price)*Number(stock.qty),pnl=value-cost;
    return {cost,value,pnl,percentage:cost?100*pnl/cost:0,breakEven:Number(stock.avg)};
  }
  function quantityRisk(cash,price,stop,riskPct=0.5,capPct=20) {
    if(!(cash>0&&price>0&&stop>0&&stop<price))return 0;
    return Math.max(0,Math.floor(Math.min(cash*riskPct/100/(price-stop),cash*capPct/100/price)));
  }
  root.RadarEngine={ema,rsi,analyze,financial,calculatePaper,positionFor,quantityRisk,round};
  if(typeof module !== 'undefined' && module.exports) module.exports=root.RadarEngine;
})(typeof window !== 'undefined' ? window : globalThis);
