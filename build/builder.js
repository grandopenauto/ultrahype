'use strict';
/**
 * UltraHype opportunity builder — offline blueprint generation only.
 * Never claims to provision a business, collect payment, or connect a live HDP service.
 */
const KITS = Object.freeze({
  'ps5-creator': {
    name: 'PS5 creator studio',
    summary: 'A gameplay recording, editing and publishing workflow using an appropriately equipped PlayStation and computer. Content earnings and audience growth are uncertain.',
    product: 'PlayStation 5 console, capture hardware and creator accessories',
    equipment: ['Verified working PS5 and compatible games', 'Capture device or supported built-in recording workflow', 'Computer/storage sized for editing', 'Microphone/headphones and optional camera', 'Reliable internet and approved publishing accounts'],
    systems: ['BuildThisMedia — content planning, production checklists and campaign creative (integration proposed)', 'HDP video/editorial workflow — scripting, titles, clips and scheduling', 'LinkStream — approved distribution links and tracking, subject to integration validation', 'UltraHype — product research and buyer-comparison destination', 'Analytics — visitor, watch-time and conversion metrics'],
    actions: ['Validate console model, capture method and total installed cost', 'Record one sample gameplay session and obtain any necessary rights/consents', 'Edit two original clips and one longer tutorial or review', 'Publish to one primary channel and track genuine engagement', 'Test a product-recommendation CTA with an affiliate disclosure'],
    monetization: ['Potential: sponsorships, original content production services, eligible affiliate referrals or channel monetization', 'No revenue is guaranteed; verify platform and rights rules'],
    compliance: ['Respect game-publisher streaming rules, copyrighted audio, privacy and platform policies', 'Use approved affiliate links and clear disclosures; do not claim untested products are personally reviewed']
  },
  'pokemon-live': {
    name: 'Pokémon live-selling studio',
    summary: 'A conventional live commerce studio for clearly identified cards and sealed products, with a real inventory ledger and seller-eligible marketplace accounts.',
    product: 'Identified genuine singles, graded cards and sealed trading-card products',
    equipment: ['Camera/phone and overhead mount', 'Lighting, microphone and stable connection', 'Background, sleeves, top-loaders and packing supplies', 'Identified product inventory with condition and actual ownership records', 'Streaming computer/software or platform-approved live tools'],
    systems: ['HobbyShopOS — inventory, SKUs, condition and collection records (connection proposed)', 'BuildThisMedia — live show scripts, overlays, thumbnails and short-form previews (connection proposed)', 'UltraHype — editorial guide and connected product discovery', 'Order/fulfillment workflow — inventory reservation, receipts and shipping logs', 'Protected workflow integration — future permissioned synchronization, with durable event/audit logs'],
    actions: ['Choose a permitted fixed-price or auction selling format and validate platform eligibility', 'Build a sample 20-item inventory with photos, identifiers and condition descriptions', 'Create a 15-minute show rundown and non-misleading product graphics', 'Run a no-purchase private rehearsal; confirm audio, camera and checkout routing', 'Launch only through a marketplace or checkout service where the seller and format are approved'],
    monetization: ['Clearly identified item sales, consignment with written agreement, or media production services', 'Do not promise sales volume, margins or premium prices'],
    compliance: ['eBay Live eligibility and platform approval may be required for livestream selling', 'eBay case/box/pack breaks are restricted to pre-approved sellers; avoid unapproved paid chance or raffle formats', 'Seller must comply with tax, authenticity, consumer-protection and payment policies']
  },
  'pokemon-inventory': {
    name: 'Pokémon card shop and collection tracker',
    summary: 'Catalog verified inventory and track missing set numbers. Use published marketplace listings to guide buyers to specific items; do not imply live automated set valuation exists before integration.',
    product: 'Documented card singles and collection/set identifiers',
    equipment: ['Card scanner or camera and lightbox', 'Protective storage and shipping materials', 'Sample verified set checklist', 'Reliable computer or mobile inventory interface'],
    systems: ['HobbyShopOS — inventory/collection registry (future adapter validation)', 'UltraHype — editorial content and marketplace search', 'FSHack — future collection-set intelligence with transparent evidence thresholds', 'LeadWizard/CRM — optional opt-in customer follow-up', 'BuildThisMedia — product visuals, guides and education content'],
    actions: ['Start with one clearly scoped Pokémon set and manually verified checklist', 'Catalog 30 example cards with set number, language, edition, condition and photos', 'Track owned, missing and duplicate inventory without speculating on value', 'Pilot fixed-price sales or affiliate referrals using approved marketplace links', 'Measure returning collectors and actual clicks, not claimed demand'],
    monetization: ['Specific inventory sales, catalog setup services, approved affiliate referrals or optional paid management services', 'No automatic investment-performance or resale guarantees'],
    compliance: ['Avoid counterfeit, custom/proxy cards mislabeled as genuine', 'Do not publish unsupported valuations or fabricated sold comps', 'Keep user collection data private and obtain consent for outreach']
  },
  'pokemon-reveal': {
    name: 'Free digital reveal demo',
    summary: 'Prototype an entertainment-only digital pack reveal with fictional demo cards and no payment, prizes, real inventory ownership transfer, gambling mechanics or cash-out.',
    product: 'Clearly labeled fictional demonstration cards',
    equipment: ['Browser-based demo with original card artwork', 'Local demo manifest and deterministic test cases', 'Optional recorded screen capture for concept video'],
    systems: ['BuildThisMedia — explanation video and launch creative (future integration)', 'UltraHype — educational product concept and non-transactional demonstration', 'HobbyShopOS — future inventory catalog integration only after applicable compliance approvals', 'AIAutoTester — future test plan and evidence for reveal integrity', 'Protected integration — no deployment until design and permissions are reviewed'],
    actions: ['Design a free non-monetary reveal UX using fictitious assets', 'Disclose that the demo has no items of monetary value and no purchase or prize', 'Show a simulated inventory manifest and clear no-transaction audit log', 'Run usability tests and review platform rules before considering any sale format', 'Do not enable paid randomized pulls, real-money outcomes, or a redemption feature without specialized legal and platform approval'],
    monetization: ['No monetization within the reveal prototype', 'A later compliant business may offer fixed, identified products or separately scoped software services after review'],
    compliance: ['No payments, stakes, real-value prizes, withdrawable credits or cashout in this prototype', 'eBay chance listings are restricted and card breaks are for pre-approved sellers', 'Paid randomized-product mechanics require separate jurisdiction-specific legal and platform review']
  }
});
const MODES = Object.freeze({
  lean: {name:'Lean proof-of-concept',tasks:['Use one simple workflow with sample or limited real inventory','Run an end-to-end test with clear success criteria','Record actual effort and any real costs before scaling']},
  production:{name:'Production-ready plan',tasks:['Specify authentication, privacy, monitoring, backup and error recovery','Verify payment/provider policies and licensing where relevant','Stage tests, access controls and rollback before production deployment']},
  client:{name:'Client-deliverable package',tasks:['Define the customer, acceptance criteria, support limits and ownership of assets','Prepare product documentation and demo/training materials','Set written deliverables, pricing and change-request terms before deployment']}
});
let selectedKit = null;
let generatedBrief = null;
const buttons = [...document.querySelectorAll('[data-kit]')];
const output = document.getElementById('brief-output');
const feedback = document.getElementById('brief-feedback');
function setSelected(key) {
  if (!Object.hasOwn(KITS,key)) return;
  selectedKit=key;
  buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.kit===key)));
}
buttons.forEach(button=>button.addEventListener('click',()=>setSelected(button.dataset.kit)));
const requested = new URLSearchParams(window.location.search).get('kit');
setSelected(requested && Object.hasOwn(KITS,requested) ? requested : 'ps5-creator');
function addSection(root,heading,values){
  const section=document.createElement('section');
  section.className='uh-step';
  const h=document.createElement('h3');h.textContent=heading;section.appendChild(h);
  const ul=document.createElement('ul');
  values.forEach(item=>{const li=document.createElement('li');li.textContent=item;ul.appendChild(li);});
  section.appendChild(ul);root.appendChild(section);
}
function briefText(brief) {
  const lines=['ULTRAHYPE | BUSINESS BUILD BRIEF','Project: '+brief.projectName,'Concept: '+brief.kitName,'Build mode: '+brief.mode,'Product anchor: '+brief.product,'',brief.summary,''];
  for(const [label,key] of [['Equipment','equipment'],['Systems / integrations to validate','systems'],['Execution steps','actions'],['Build-mode gates','modeTasks'],['Potential revenue paths','monetization'],['Compliance / approvals','compliance']]){
    lines.push(label.toUpperCase());for(const item of brief[key])lines.push('• '+item);lines.push('');
  }
  lines.push('Status: Concept blueprint only. Not deployed, connected, or commercially approved.');return lines.join('\n');
}
document.getElementById('generate-brief').addEventListener('click',()=>{
 const kit=KITS[selectedKit];if(!kit)return;
 const modeValue=document.getElementById('delivery-mode').value;
 const mode=MODES[modeValue]||MODES.lean;
 const projectName=document.getElementById('business-name').value.trim().slice(0,80)||kit.name;
 generatedBrief={schemaVersion:'uh-business-blueprint-1',source:'UltraHype opportunity builder',generatedAt:new Date().toISOString(),projectName,kitId:selectedKit,kitName:kit.name,mode:mode.name,product:kit.product,summary:kit.summary,equipment:[...kit.equipment],systems:[...kit.systems],actions:[...kit.actions],modeTasks:[...mode.tasks],monetization:[...kit.monetization],compliance:[...kit.compliance],executionAuthorized:false,serviceConnected:false};
 document.getElementById('brief-title').textContent=projectName;
 document.getElementById('brief-summary').textContent=kit.summary;
 const steps=document.getElementById('brief-steps');steps.replaceChildren();
 for (const [label,key] of [['Physical product & equipment','equipment'],['Software and AI components to connect','systems'],['Implementation sequence','actions'],['Build-mode requirements','modeTasks'],['Potential revenue paths','monetization'],['Required approvals and guardrails','compliance']]) addSection(steps,label,generatedBrief[key]);
 output.hidden=false;
 feedback.textContent='Your brief is ready to copy or download. No external service was contacted.';
 output.scrollIntoView({behavior:'smooth',block:'start'});
});
document.getElementById('copy-brief').addEventListener('click',async()=>{
 if(!generatedBrief)return;
 try{await navigator.clipboard.writeText(briefText(generatedBrief));feedback.textContent='Brief copied to clipboard.';}
 catch{feedback.textContent='Clipboard unavailable in this browser. Use Download JSON instead.';}
});
document.getElementById('download-brief').addEventListener('click',()=>{
 if(!generatedBrief)return;
 const blob=new Blob([JSON.stringify(generatedBrief,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='ultrahype-'+generatedBrief.kitId+'-blueprint.json';a.click();URL.revokeObjectURL(url);
 feedback.textContent='JSON build brief prepared for download.';
});