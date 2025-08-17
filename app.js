/* AstrumBit: robust two-way converter + CoinGecko tokens + logos */
(() => {
  'use strict';

  // DOM
  const yearEl = document.getElementById('year'); if (yearEl) yearEl.textContent = new Date().getFullYear();
  const fromPicker = document.getElementById('fromPicker');
  const toPicker   = document.getElementById('toPicker');
  const fromHidden = document.getElementById('fromAsset');
  const toHidden   = document.getElementById('toAsset');
  const fromAmount = document.getElementById('fromAmount');
  const toAmount   = document.getElementById('toAmount');
  const rateEl     = document.getElementById('rate');
  const rateLabel  = document.getElementById('rateLabel');
  const tokenDialog = document.getElementById('tokenDialog');
  const tokenDialogClose = document.getElementById('tokenDialogClose');
  const tokenSearch = document.getElementById('tokenSearch');
  const tokenList = document.getElementById('tokenList');
  const btnSwap = document.getElementById('btnSwap');
  const btnCalc = document.getElementById('btnCalc');

  // Utils
  const money = (n) => isFinite(n) ? '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
  const fmt = (n) => isFinite(n) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 8 }) : '—';
  const sanitize = (s) => {
    s = (s || '').toString().replace(',', '.').replace(/[^0-9.]/g, '');
    const parts = s.split('.'); if (parts.length > 1) s = parts.shift() + '.' + parts.join('');
    if (s.startsWith('.')) s = '0' + s;
    return s;
  };
  function hashHue(str){let h=0;for(let i=0;i<str.length;i++)h=(h*31+str.charCodeAt(i))|0;return Math.abs(h)%360}
  function avatarStyle(symbol){const h=hashHue(symbol);const h2=(h+40)%360;return `background: conic-gradient(from 180deg, hsl(${h} 80% 60%), hsl(${h2} 70% 55%), hsl(${h} 80% 60%));`;}

  // Logos
  const LOGO_ALIASES = { POL:'matic', MATIC:'matic', XBT:'btc' };
  function logoSlug(symbol){const s=(symbol||'').toUpperCase();return (LOGO_ALIASES[s]||s).toLowerCase();}
  function logoCandidates(symbol){
    const slug=logoSlug(symbol);
    return [
      `https://assets.coingecko.com/coins/images/1/large/bitcoin.png`, // will be replaced if we have direct url
      `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${slug}.svg`,
      `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${slug}.png`,
      `https://cryptoicons.org/api/icon/${slug}/200`
    ];
  }
  const logoCache = new Map();
  function applyLogo(container, symbol, url){
    if(!container) return;
    const key = (symbol||'').toUpperCase() + (url?`|${url}`:'');
    const cached = logoCache.get(key);
    container.innerHTML=''; container.removeAttribute('style');
    const setFallback=()=>{container.innerHTML=''; container.setAttribute('style', avatarStyle(symbol||'X'));};
    const tryList = (list)=>{
      let i=0;
      const img = new Image(); img.loading='lazy'; img.decoding='async'; img.alt=(symbol||'')+' logo'; img.referrerPolicy='no-referrer';
      const next=()=>{ if(i>=list.length){logoCache.set(key,null); setFallback(); return;} img.src=list[i++]; };
      img.onload=()=>{logoCache.set(key,img.src); container.appendChild(img);};
      img.onerror=next; next();
    };
    if(url){ const test = new Image(); test.onload=()=>{logoCache.set(key,url); container.appendChild(test);}; test.onerror=()=>tryList(logoCandidates(symbol)); test.src=url; return; }
    if(cached===null){ setFallback(); return; }
    if(cached){ const img=new Image(); img.onload=()=>container.appendChild(img); img.src=cached; return; }
    tryList(logoCandidates(symbol));
  }

  // CoinGecko data
  let tokenData = [];          // {id, symbol, name, img, price, change}
  let tokenBySymbol = new Map();
  let BASE = {};               // symbol -> price
  let page=1, perPage=150, loading=false;
  let pickTarget='from';
  let activeInput = null;      // 'from' | 'to' to avoid recursion
  async function fetchMarkets(p=1){
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${p}&price_change_percentage=24h`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('CoinGecko '+res.status);
    return res.json();
  }
  async function loadPage(p=1){
    if(loading) return; loading=true;
    try{
      const rows = await fetchMarkets(p);
      const mapped = rows.map(t => ({
        id:t.id, symbol:String(t.symbol||'').toUpperCase(), name:t.name||'',
        img:t.image||'', price:Number(t.current_price||0),
        change: typeof t.price_change_percentage_24h==='number' ? t.price_change_percentage_24h : 0
      }));
      const exists = new Set(tokenData.map(x=>x.id));
      mapped.forEach(m => { if(!exists.has(m.id)) tokenData.push(m); });
      rebuildIndex();
      renderTokenList(tokenSearch?.value||'');
      updateUIPrices();
    }catch(e){ console.error(e); }
    finally{ loading=false; }
  }
  function rebuildIndex(){
    tokenBySymbol = new Map(); BASE = {};
    for(const t of tokenData){ if(!tokenBySymbol.has(t.symbol)) tokenBySymbol.set(t.symbol,t); BASE[t.symbol]=t.price; }
  }

  // Picker & modal
  function openTokenDialog(which){
    pickTarget = which;
    tokenSearch.value = '';
    renderTokenList('');
    if(typeof tokenDialog.showModal==='function'){ tokenDialog.showModal(); setTimeout(()=>tokenSearch.focus(),0); }
    else alert('Диалог выбора токена не поддерживается.');
  }
  function closeTokenDialog(){ if(tokenDialog?.open) tokenDialog.close(); }
  function tokenMatches(t,q){ if(!q) return true; q=q.toLowerCase().trim(); return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q); }
  function renderTokenList(query){
    tokenList.innerHTML='';
    const list = (query ? tokenData.filter(t=>tokenMatches(t,query)) : tokenData);
    if(!list.length){ const div=document.createElement('div'); div.className='token-empty'; div.textContent='Ничего не найдено'; tokenList.appendChild(div); return; }
    for(const t of list){
      const row=document.createElement('button'); row.className='token-item'; row.setAttribute('data-symbol', t.symbol);
      row.innerHTML = `
        <div class="logo"></div>
        <div class="meta"><strong class="sym">${t.symbol}</strong><span class="name">${t.name}</span></div>
        <div class="price">${money(t.price)}</div>
        <div class="change ${t.change>=0?'pct up':'pct down'}">${t.change>=0?'+':''}${t.change.toFixed(1)}%</div>`;
      row.onclick = () => { setToken(pickTarget, t.symbol, t); closeTokenDialog(); };
      tokenList.appendChild(row);
      applyLogo(row.querySelector('.logo'), t.symbol, t.img);
    }
    // infinite scroll anchor
    let anchor = document.getElementById('token-scroll-anchor');
    if(!anchor){ anchor=document.createElement('div'); anchor.id='token-scroll-anchor'; anchor.style.height='1px'; tokenDialog.querySelector('.token-dialog').appendChild(anchor); observer.observe(anchor); }
  }

  // Set token to picker
  function setToken(which, symbol, tokenObj=null){
    const t = tokenObj || tokenBySymbol.get(symbol);
    if(!t) return;
    const btn = which==='from'?fromPicker:toPicker;
    const hidden = which==='from'?fromHidden:toHidden;
    hidden.value = t.symbol;
    btn.querySelector('.picker-sym').textContent = t.symbol;
    btn.querySelector('.picker-name').textContent = t.name;
    const priceEl = btn.querySelector('.picker-price'); priceEl.textContent = money(t.price); priceEl.setAttribute('data-symbol', t.symbol);
    applyLogo(btn.querySelector('.logo'), t.symbol, t.img);
    persist();
    updateRate();
    // propagate conversion if there is amount
    if(which==='from') recalcTo();
    else recalcFrom();
  }

  // Conversion
  function getPrice(sym){ return BASE[sym]; }
  function rate(fromSym,toSym){
    const a=getPrice(fromSym), b=getPrice(toSym);
    if(!isFinite(a)||!isFinite(b)||a<=0||b<=0) return null;
    return b/a;
  }
  function updateRate(){
    const r = rate(fromHidden.value, toHidden.value);
    rateEl.textContent = r ? `1 ${fromHidden.value} ≈ ${fmt(r) } ${toHidden.value}` : '—';
  }
  function recalcTo(){
    if(activeInput==='to') return;
    activeInput = 'from';
    const a = parseFloat(sanitize(fromAmount.value))||0;
    const r = rate(fromHidden.value, toHidden.value);
    toAmount.value = r ? fmt(a*r) : '';
    activeInput = null;
  }
  function recalcFrom(){
    if(activeInput==='from') return;
    activeInput = 'to';
    const b = parseFloat(sanitize(toAmount.value))||0;
    const r = rate(fromHidden.value, toHidden.value);
    fromAmount.value = r ? fmt(b/r) : '';
    activeInput = null;
  }

  // Events
  fromPicker.addEventListener('click', () => openTokenDialog('from'));
  toPicker.addEventListener('click', () => openTokenDialog('to'));
  tokenDialogClose?.addEventListener('click', closeTokenDialog);
  tokenDialog?.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeTokenDialog(); });
  tokenDialog?.addEventListener('click', (e)=>{
    const rect = tokenDialog.querySelector('.token-dialog')?.getBoundingClientRect(); if(!rect) return;
    const inside = e.clientX>=rect.left && e.clientX<=rect.right && e.clientY>=rect.top && e.clientY<=rect.bottom; if(!inside) closeTokenDialog();
  });
  tokenSearch?.addEventListener('input', ()=> renderTokenList(tokenSearch.value));

  fromAmount.addEventListener('input', ()=>{ fromAmount.value = sanitize(fromAmount.value); recalcTo(); rateLabel.textContent='Текущий курс'; });
  toAmount.addEventListener('input', ()=>{ toAmount.value = sanitize(toAmount.value); recalcFrom(); rateLabel.textContent='Текущий курс'; });
  btnSwap.addEventListener('click', ()=>{
    const a=fromHidden.value, b=toHidden.value;
    setToken('from', b); setToken('to', a);
    // swap amounts with recomputation
    const fa = fromAmount.value; const ta = toAmount.value;
    fromAmount.value = ta; toAmount.value = fa;
    recalcTo(); updateRate();
  });
  btnCalc.addEventListener('click', ()=>{ rateLabel.textContent='Зафиксированный курс (демо)'; updateRate(); });

  // Infinite scroll
  const observer = new IntersectionObserver(async ([e])=>{
    if(e.isIntersecting && (tokenSearch.value||'').trim()===''){ page+=1; await loadPage(page); }
  }, { root: tokenDialog.querySelector('.token-dialog'), threshold: 1 });

  // Prices refresh
  async function refreshTopPage(){
    try{
      const rows = await fetchMarkets(1);
      const byId = new Map(rows.map(t=>[t.id,t]));
      tokenData = tokenData.map(t => {
        const n=byId.get(t.id);
        return n ? {...t, price:Number(n.current_price||t.price), change: typeof n.price_change_percentage_24h==='number'?n.price_change_percentage_24h:t.change } : t;
      });
      rebuildIndex();
      updateUIPrices();
    }catch(e){ console.error(e); }
  }
  function updateUIPrices(){
    // picker prices
    document.querySelectorAll('.picker-price[data-symbol]').forEach(el=>{
      const sym=el.getAttribute('data-symbol'); const v = BASE[sym]; if(v!=null) el.textContent = money(v);
    });
    // top cards
    document.querySelectorAll('.price[data-symbol]').forEach(el=>{
      const sym=el.getAttribute('data-symbol'); const v=BASE[sym]; if(v!=null) el.textContent = money(v);
    });
    document.querySelectorAll('[data-change]').forEach(el=>{
      const sym=el.getAttribute('data-change'); const t=tokenBySymbol.get(sym); if(!t) return;
      el.textContent = `${t.change>=0?'+':''}${t.change.toFixed(1)}%`; el.classList.toggle('up', t.change>=0); el.classList.toggle('down', t.change<0);
    });
    // if modal open, update rows
    if(tokenDialog.open){
      tokenList.querySelectorAll('[data-symbol]').forEach(row=>{
        const sym=row.getAttribute('data-symbol'); const t=tokenBySymbol.get(sym); if(!t) return;
        const p=row.querySelector('.price'); const c=row.querySelector('.change'); if(p) p.textContent = money(t.price);
        if(c){ c.textContent=`${t.change>=0?'+':''}${t.change.toFixed(1)}%`; c.classList.toggle('up', t.change>=0); c.classList.toggle('down', t.change<0); }
      });
    }
    updateRate();
  }

  // Persistence
  const STATE_KEY='astrumbit:state:v4';
  function persist(){ try{ localStorage.setItem(STATE_KEY, JSON.stringify({from:fromHidden.value,to:toHidden.value,fa:fromAmount.value,ta:toAmount.value})) }catch{} }
  function restore(){
    try{
      const s = JSON.parse(localStorage.getItem(STATE_KEY)||'{}');
      if(s.from) fromHidden.value = s.from;
      if(s.to) toHidden.value = s.to;
      if(s.fa) fromAmount.value = s.fa;
      if(s.ta) toAmount.value = s.ta;
    }catch{}
  }

  // Init
  (async () => {
    restore();
    await loadPage(1);
    // Default tokens if empty
    if(!fromHidden.value) fromHidden.value = 'BTC';
    if(!toHidden.value) toHidden.value = 'USDT';
    // Populate pickers from dataset (might run before images load; safe)
    const f = tokenBySymbol.get(fromHidden.value) || tokenData[0];
    const t = tokenBySymbol.get(toHidden.value) || tokenData.find(x=>x.symbol==='USDT') || tokenData[1];
    setToken('from', f.symbol, f);
    setToken('to', t.symbol, t);
    // Init top card logos
    document.querySelectorAll('.avatar.logo[data-symbol]').forEach(el=>{
      const sym = el.getAttribute('data-symbol');
      const tok = tokenBySymbol.get(sym);
      applyLogo(el, sym, tok?.img);
    });
    updateUIPrices();
    setInterval(refreshTopPage, 30000);
  })();
})();
