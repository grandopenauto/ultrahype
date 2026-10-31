'use strict';
/* UltraHype Campaign Studio — deterministic local draft generator.
 * No server calls, cookies, credentials, ad placement or automatic publishing.
 */
(() => {
const CAMPAIGNS = Object.freeze({
  ps5: {
    name:'PS5: from a smart purchase to a creator setup',
    product:'PlayStation 5 console',
    url:'https://ultrahype.store/discover/ps5/',
    build:'https://ultrahype.store/build/?kit=ps5-creator',
    shopping:'Compare disc, Digital Edition and Pro models, with seller-condition checks and links to actual marketplace results.',
    discovery:'A games console might also be the first tool in a practical recording-and-editing workflow.',
    business:'Use a console, audio, capture and editing tools to prototype a gameplay creator studio. Audience and revenue are not guaranteed.',
    hookShop:'PS5 Disc, Digital or Pro? The cheapest listing may not be your cheapest setup.',
    hookDiscover:'UH?! A PS5 is more than a console when you combine it with the right creative tools.',
    hookBuild:'UH?! What would it take to build a creator studio around a PS5?',
    question:'What matters most to you when shopping for a console: the upfront price, game library or future uses?',
    subject:'An UltraHype PS5 comparison worth exploring',
    video:['OPEN: Big UH?! animated reaction on a clean dark background.','SHOW: Three PS5 model labels; explain that models, drive support and used condition matter.','REVEAL: A basic, realistic workflow—console → capture → edit → publish.','CLOSE: Visit the PS5 guide; compare real listings; explore a creator-studio blueprint.'],
    gifTags:['ultrahype','uh moment','ps5','gaming setup','creator studio','discover','build'],
    media:'Film or render an original, rights-cleared console comparison; do not imply endorsement by Sony or eBay.'
  },
  pokemon: {
    name:'Pokémon: from collecting to a commerce workflow',
    product:'Pokémon trading cards',
    url:'https://ultrahype.store/discover/pokemon/',
    build:'https://ultrahype.store/build/?kit=pokemon-live',
    shopping:'Compare singles, graded cards and sealed products. Shop verified current listings and evaluate condition and authenticity.',
    discovery:'One card can be a collection milestone, a shop product or the subject of a livestream—each needs different decisions.',
    business:'Prototype a standard fixed-inventory card-selling show or an inventory/collection tracker, using approved platforms and legitimate sales formats.',
    hookShop:'Pokémon singles, graded or sealed? Three purchases with three different goals.',
    hookDiscover:'UH?! The card you want could complete a collection—or spark an entirely different idea.',
    hookBuild:'UH?! How does a Pokémon collection become a documented live-selling operation?',
    question:'Do you collect for a particular set, play the game, or enjoy opening sealed products?',
    subject:'Pokémon collecting has more than one path',
    video:['OPEN: An original UH?! animation, followed by an organized card-binder reveal.','SHOW: Three choices—raw single, graded card, sealed product; no fabricated values.','REVEAL: Verified inventory → show plan → approved live-selling channel → fulfillment records.','CLOSE: Browse the Pokémon guide and draft a compliant business setup.'],
    gifTags:['ultrahype','uh moment','pokemon cards','card collector','trading card setup','collection','business ideas'],
    media:'Use original card photography where rights allow. Do not suggest paid randomized digital pulls or unauthorised card-break sales.'
  },
  iphone: {
    name:'Refurbished iPhone: turn an everyday phone into a dedicated tool',
    product:'Used or refurbished iPhone',
    url:'https://ultrahype.store/discover/refurbished-iphone/',
    build:'https://ultrahype.store/build/',
    shopping:'Compare battery health, Activation Lock, carrier compatibility, parts history and return terms.',
    discovery:'A compatible older iPhone can sometimes become a dedicated camera, inventory-photo station or operations screen.',
    business:'Explore a simple business workflow supported by a compatible phone, with app support and security checked first.',
    hookShop:'Used iPhone deal? Check these things before treating the lowest price as a bargain.',
    hookDiscover:'UH?! An older iPhone can still do useful work if the hardware and software are supported.',
    hookBuild:'UH?! Could a refurbished iPhone be a dedicated tool for a small business?',
    question:'What would you use a second iPhone for: photos, check-in, work calls or something else?',
    subject:'A used iPhone buying checklist with a twist',
    video:['OPEN: UH?! reaction, then a clean used-phone product silhouette.','SHOW: Activation Lock, battery health, carrier compatibility and condition checks.','REVEAL: The same phone operating as a dedicated inventory-photo station or business screen.','CLOSE: Read the checklist and evaluate a specific compatible model.'],
    gifTags:['ultrahype','uh moment','refurbished iphone','iphone tips','second phone','business tools'],
    media:'Use original phone visuals, avoid unverified repair/refurbishment claims, and verify software support.'
  }
});
const copyButtons = [];
const root=document.getElementById('packet');
const cards=document.getElementById('uh-post-grid');
const reviews=document.getElementById('uh-review-grid');
const status=document.getElementById('uh-packet-status');
let packet=null;
const angleCopy=(c,a)=>a==='shop'?c.shopping:a==='discover'?c.discovery:c.business;
const hook=(c,a)=>a==='shop'?c.hookShop:a==='discover'?c.hookDiscover:c.hookBuild;
const tag=(id)=>String(id||'uh-launch-01').toLowerCase().replace(/[^a-z0-9_-]/g,'-').slice(0,32)||'uh-launch-01';
function tracked(url,platform,campaignId){
 const u=new URL(url);
 u.searchParams.set('utm_source',platform);
 u.searchParams.set('utm_medium','organic_social');
 u.searchParams.set('utm_campaign',campaignId);
 return u.toString();
}
function constructChannels(c,a,id){
 const lead=hook(c,a),body=angleCopy(c,a);
 const url=p=>tracked(c.url,p,id),build=p=>tracked(c.build,p,id);
 return [
  {id:'linkedin',label:'LinkedIn',format:'Short thought-leadership post',text:[lead,'',body,'','What I like about UltraHype is exploring what a product can become—not just what it costs.','',c.question,'',url('linkedin'),'','Affiliate relationships may generate a commission.'].join('\n'),notes:'Original insight; adjust for your network. Do not claim results you have not measured.'},
  {id:'x',label:'X / Threads',format:'Compact post',text:[lead,body,url('x')].join('\n\n'),notes:'Shorten further if the platform’s current character count requires it; avoid copy-paste flooding.'},
  {id:'pinterest',label:'Pinterest',format:'Idea Pin / discovery caption',text:[lead,body,'Explore the buyer guide:',url('pinterest')].join('\n\n'),notes:'Create an original vertical image with descriptive alt text and a useful, non-misleading title.'},
  {id:'instagram',label:'Instagram / Reels',format:'Caption for original visual',text:[lead,body,'','UH? Find it. Understand it. Explore what it can become.','',c.question,'','Read the guide through our profile link: ultrahype.store'],notes:'Feed captions usually do not provide clickable links. Add the actual destination through an authorized profile/link feature.'},
  {id:'video',label:'Short Video',format:'10–25 second production brief',text:[...c.video,'','Landing page: '+url('shortvideo'),'Media: '+c.media].join('\n'),notes:'For BuildThisMedia: ask for rights-cleared footage, native captions, vertical and square crops, and an honest end card.'},
  {id:'giphy',label:'GIPHY Brand GIF',format:'Animation brief and search tags',text:['Reaction: “UH?!” → “OH! I COULD BUILD THAT.”','Brand: UltraHype','Animated asset: original design, no third-party logos.','Tags: '+c.gifTags.join(', '),'Source URL: '+url('giphy'),'Create 1 branded GIF and 1 transparent animated sticker; no implied third-party endorsement.'].join('\n'),notes:'Apply for GIPHY Brand Channel. Upload only original or properly licensed media; comply with tags and sticker transparency requirements.'},
  {id:'email',label:'Permission-based email',format:'Optional, opt-in newsletter blurb',text:['Subject: '+c.subject,'',lead,body,'',url('email'),'','Why you received this: you opted into UltraHype content. Unsubscribe: [insert real working unsubscribe mechanism before sending].'].join('\n'),notes:'Draft for an existing consent-based audience only. Do not send unsolicited mass email.'},
  {id:'buildthismedia',label:'BuildThisMedia',format:'Production handoff draft',text:['Project: '+c.name,'Objective: '+body,'','Deliverables: original 15-second clip; 9:16 vertical cut; 1:1 social tile; looping branded GIF; transparent UH?! sticker.','Creative concept: '+c.video.join(' '),'Use case: '+c.media,'Landing: '+url('media'),'Business builder: '+build('media')].join('\n'),notes:'Planning artifact only. No live BuildThisMedia connection or provisioning exists here.'}
 ];
}
function plainText(p){
 return ['ULTRAHYPE CAMPAIGN PACKET',p.title,'Angle: '+p.angle,'Campaign ID: '+p.campaignId,'Product: '+p.product,'Guide: '+p.url,'Build: '+p.build,'Status: draft; approval required',''].concat(p.channels.flatMap(c=>['### '+c.label,c.text,'Notes: '+c.notes,''])).join('\n');
}
function renderLink(element,url){
 const u=new URL(url);
 element.href=u.toString();element.textContent=u.toString();
}
async function copyText(value){
 try{await navigator.clipboard.writeText(value);status.textContent='Text copied. Review before posting.';}
 catch{status.textContent='Copy unavailable in this browser. Use Download build packet instead.';}
}
function renderPosts(p){
 cards.replaceChildren();
 p.channels.forEach(ch=>{
  const article=document.createElement('article');article.className='uh-post-card';
  const meta=document.createElement('small');meta.textContent=ch.format;
  const h=document.createElement('h3');h.textContent=ch.label;
  const pre=document.createElement('pre');pre.textContent=ch.text;
  const note=document.createElement('p');note.textContent=ch.notes;
  const btn=document.createElement('button');btn.className='uh-copy-btn';btn.textContent='Copy '+ch.label+' draft';btn.type='button';
  btn.addEventListener('click',()=>copyText(ch.text));
  article.append(meta,h,pre,note,btn);cards.appendChild(article);
 });
}
function checkedGates(){
 return [...reviews.querySelectorAll('input[data-gate]')].filter(n=>n.checked).map(n=>n.dataset.gate);
}
function reportGates(){
 const count=checkedGates().length;
 const label=document.getElementById('uh-gates-status');
 label.textContent=count+'/6 reviewed. These checks do not automatically authorize publishing.';
}
reviews.addEventListener('change',reportGates);
function generate(){
 const id=tag(document.getElementById('uh-id').value);
 document.getElementById('uh-id').value=id;
 const key=document.getElementById('uh-campaign').value;
 const angle=document.getElementById('uh-angle').value;
 const c=CAMPAIGNS[key];
 if(!c)return;
 packet={schema:'uh-campaign-packet-v1',generatedAt:new Date().toISOString(),project:'UltraHype',campaignId:id,title:c.name,product:c.product,angle,
   url:c.url,build:c.build,landingWithTracking:tracked(c.url,'studio',id),channels:constructChannels(c,angle,id),
   reviewGates:[],status:'draft',approvalRequired:true,postingAuthorized:false,buildThisMediaConnected:false};
 document.getElementById('uh-packet-title').textContent=c.name;
 document.getElementById('uh-packet-summary').textContent=angleCopy(c,angle);
 renderLink(document.getElementById('uh-landing'),packet.landingWithTracking);
 renderLink(document.getElementById('uh-builder'),packet.build);
 reviews.querySelectorAll('input[data-gate]').forEach(input=>input.checked=false);
 reportGates();renderPosts(packet);root.hidden=false;
 status.textContent='Draft packet generated locally. No content has been sent or published.';
 root.scrollIntoView({behavior:'smooth',block:'start'});
}
document.getElementById('uh-generate').addEventListener('click',generate);
document.getElementById('uh-copy-all').addEventListener('click',()=>{if(packet)copyText(plainText(packet));});
document.getElementById('uh-export').addEventListener('click',()=>{
 if(!packet)return;
 const snapshot={...packet,reviewGates:checkedGates(),status:'draft',approvalRequired:true,postingAuthorized:false};
 const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
 const link=document.createElement('a');
 const uri=URL.createObjectURL(blob);
 link.href=uri;link.download='ultrahype-'+packet.campaignId+'-campaign.json';
 link.click();setTimeout(()=>URL.revokeObjectURL(uri),1000);
 status.textContent='Draft build packet exported. No remote service was contacted.';
});
})();
