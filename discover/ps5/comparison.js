'use strict';
// Only present marketplace-sourced listings when the protected backend verifies PRODUCTION.
const root = document.getElementById('ps5-listing-comparison');
const refresh = document.getElementById('ps5-refresh');
const sections = [
  {key:'disc',name:'PS5 disc / Slim disc',q:'PlayStation 5 Slim Disc Console'},
  {key:'digital',name:'PS5 Digital Edition',q:'PlayStation 5 Digital Edition Console'},
  {key:'pro',name:'PS5 Pro',q:'PlayStation 5 Pro Console'}
];
function isConsole(item,kind){
 const title=String(item.title||'').toLowerCase();
 if(!/\b(ps5|playstation\s*5)\b/i.test(title))return false;
 if(!/\bconsole\b/i.test(title))return false;
 if(/\b(for parts|parts only|not working|broken|repair|replacement|shell|housing|empty box|box only|read description|no console|digital code|controller only|stand only|cover plate)\b/i.test(title))return false;
 if(kind==='pro')return /\bpro\b/i.test(title)&&!/\bpro controller\b/i.test(title);
 if(kind==='digital')return /\bdigital\b/i.test(title)&&!/\bpro\b/i.test(title);
 return !/\bdigital\b/i.test(title)&&!/\bpro\b/i.test(title);
}
function validPrice(item){const n=Number(item?.price?.value);return Number.isFinite(n)&&n>0&&n<4000;}
function makeLink(item,q) {
 const params=new URLSearchParams({id:String(item.id),q});
 const a=document.createElement('a');
 a.href='../../market-item.html?'+params.toString();
 a.textContent='Review seller details ↗';a.className='uh-listing-cta';
 return a;
}
function card(item,q){
 const section=document.createElement('article');section.className='uh-live-card';
 const image=String(item.imageUrl||item.image||'');
 if(/^https:\/\//i.test(image)){
   const img=document.createElement('img');img.src=image;img.loading='lazy';img.alt=String(item.title||'PS5 marketplace listing');img.referrerPolicy='no-referrer';
   img.addEventListener('error',()=>img.remove(),{once:true});section.appendChild(img);
 }
 const wrap=document.createElement('div');wrap.className='uh-live-copy';
 const title=document.createElement('h4');title.textContent=String(item.title||'PS5 console');wrap.appendChild(title);
 const condition=document.createElement('p');condition.className='uh-live-meta';condition.textContent='Condition: '+String(item.condition||'seller stated; verify')+' · Seller: '+String(item.seller?.username||'see listing');wrap.appendChild(condition);
 const price=document.createElement('p');price.className='uh-live-price';
 try{price.textContent=new Intl.NumberFormat('en-US',{style:'currency',currency:String(item.price.currency||'USD')}).format(Number(item.price.value));}
 catch{price.textContent=String(item.price.value)+' '+String(item.price.currency||'USD');}
 wrap.appendChild(price);
 const caveat=document.createElement('p');caveat.className='uh-live-meta';caveat.textContent='Listing price only; shipping and taxes may be extra.';wrap.appendChild(caveat);
 wrap.appendChild(makeLink(item,q));section.appendChild(wrap);return section;
}
async function load(){
 if(!root)return;
 if(refresh)refresh.disabled=true;
 root.replaceChildren();
 root.textContent='Checking eBay source availability…';
 try{
  const cfg=window.ULTRAHYPE_CONFIG;
  const base=String(cfg?.apiBase||'').replace(/\/$/,'');
  if(!base||!/^https:\/\//i.test(base))throw Error('Secure marketplace backend not configured.');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  let status;
  try{
   const res=await fetch(base+'/api/commerce/ebay/status',{signal:controller.signal,headers:{Accept:'application/json'}});
   if(!res.ok)throw Error('Marketplace status unavailable.');
   status=await res.json();
  }finally{clearTimeout(timeout);}
  if(status?.ok!==true||status?.tokenValid!==true||String(status.environment||'').toLowerCase()!=='production')throw Error('Verified production inventory is not available. No prices are shown.');
  root.replaceChildren();
  let success=0;
  for(const option of sections){
    const block=document.createElement('section');block.className='uh-live-group';
    const h=document.createElement('h3');h.textContent=option.name;block.appendChild(h);
    const list=document.createElement('div');list.className='uh-live-items';block.appendChild(list);
    const q=new URLSearchParams({q:option.q,limit:'12',offset:'0'});
    try{
      const response=await fetch(base+'/api/commerce/ebay/search?'+q.toString(),{headers:{Accept:'application/json'}});
      if(!response.ok)throw Error('Search unavailable');
      const payload=await response.json();
      if(String(payload.environment||'').toLowerCase()!=='production')throw Error('Unverified source environment');
      const items=Array.isArray(payload.items)?payload.items.filter(x=>x?.id&&isConsole(x,option.key)&&validPrice(x)).slice(0,3):[];
      if(!items.length){const p=document.createElement('p');p.className='uh-live-meta';p.textContent='No matching verified console listings returned in this sample. Try the full marketplace.';list.appendChild(p);}
      else {items.forEach(item=>list.appendChild(card(item,option.q)));success+=items.length;}
    }catch{
      const p=document.createElement('p');p.className='uh-live-meta';p.textContent='This search is temporarily unavailable. No sample prices were substituted.';list.appendChild(p);
    }
    const more=document.createElement('a');more.href='../../marketplace.html?q='+encodeURIComponent(option.q);more.textContent='Explore all connected '+option.name+' listings ↗';more.className='uh-listing-more';block.appendChild(more);root.appendChild(block);
  }
  const note=document.createElement('p');note.className='uh-disclosure';note.textContent=success+' marketplace listing'+(success===1?'':'s')+' displayed in this snapshot. Prices, seller descriptions and availability may change; this is not a guaranteed ranking or complete market survey. Check each seller listing before buying.';root.prepend(note);
 }catch(error){
   root.replaceChildren();
   const p=document.createElement('p');p.className='uh-live-meta';
   p.textContent=error.name==='AbortError'?'Marketplace status timed out. Try again later.':String(error.message||'Marketplace unavailable.');
   root.appendChild(p);
   const a=document.createElement('a');a.href='../../marketplace.html?q='+encodeURIComponent('PlayStation 5 console');a.textContent='Open UltraHype marketplace search ↗';root.appendChild(a);
 }finally{if(refresh)refresh.disabled=false;}
}
refresh?.addEventListener('click',load);
load();