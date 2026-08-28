const el={
loginPanel:document.getElementById("loginPanel"),adminPanel:document.getElementById("adminPanel"),
password:document.getElementById("password"),loginBtn:document.getElementById("loginBtn"),
loginMessage:document.getElementById("loginMessage"),logoutBtn:document.getElementById("logoutBtn"),
referenceList:document.getElementById("referenceList"),roiSection:document.getElementById("roiSection"),
roiWrap:document.getElementById("roiWrap"),roiImage:document.getElementById("roiImage"),
savedLayer:document.getElementById("savedLayer"),draftBox:document.getElementById("draftBox"),
roiLabel:document.getElementById("roiLabel"),xVal:document.getElementById("xVal"),
yVal:document.getElementById("yVal"),wVal:document.getElementById("wVal"),
hVal:document.getElementById("hVal"),saveBtn:document.getElementById("saveBtn"),
resetBtn:document.getElementById("resetBtn"),roiMessage:document.getElementById("roiMessage"),
regionList:document.getElementById("regionList")
};

let currentReferenceId=null,drawing=false,start=null,draft=null;

el.loginBtn.onclick=login;el.logoutBtn.onclick=logout;el.saveBtn.onclick=saveRegion;el.resetBtn.onclick=resetDraft;
el.roiWrap.addEventListener("pointerdown",startDraw);
el.roiWrap.addEventListener("pointermove",moveDraw);
window.addEventListener("pointerup",endDraw);

checkSession();

async function checkSession(){
 const r=await fetch("/api/admin/me");
 if(r.ok){showAdmin()}else{showLogin()}
}
function showLogin(){el.loginPanel.hidden=false;el.adminPanel.hidden=true}
function showAdmin(){el.loginPanel.hidden=true;el.adminPanel.hidden=false;loadReferences()}
async function login(){
 const r=await fetch("/api/admin/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:el.password.value})});
 const d=await r.json();
 if(!r.ok){el.loginMessage.textContent=d.error;el.loginMessage.className="message error";return}
 showAdmin()
}
async function logout(){await fetch("/api/admin/logout",{method:"POST"});showLogin()}

async function loadReferences(){
 const r=await fetch("/api/admin/references");
 const d=await r.json();
 el.referenceList.innerHTML=(d.items||[]).map(i=>`
 <div class="reference-item">
  <img src="/api/reference/image/${i.id}">
  <div class="reference-meta">
   <strong>${esc(i.title)}</strong>
   <span>검사영역 ${Number(i.region_count||0)}개</span>
  </div>
  <button class="btn small" onclick="openEditor(${i.id},'${jsEsc(i.title)}')">검사영역 설정</button>
 </div>`).join("") || "<div class='placeholder'>등록된 기준사진이 없습니다.</div>";
}

window.openEditor=async function(id,title){
 currentReferenceId=id;resetDraft();
 el.roiImage.src=`/api/reference/image/${id}?v=${Date.now()}`;
 el.roiSection.hidden=false;
 el.roiMessage.textContent=`${title} 검사영역을 설정합니다.`;
 await loadRegions();
 el.roiSection.scrollIntoView({behavior:"smooth"});
}

function point(e){
 const r=el.roiWrap.getBoundingClientRect();
 return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}
}
function startDraw(e){if(!currentReferenceId)return;e.preventDefault();drawing=true;start=point(e);draft={x:start.x,y:start.y,width:0,height:0};el.draftBox.hidden=false;renderDraft()}
function moveDraw(e){if(!drawing)return;const p=point(e);draft={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),width:Math.abs(p.x-start.x),height:Math.abs(p.y-start.y)};renderDraft()}
function endDraw(){if(!drawing)return;drawing=false;if(!draft||draft.width<.01||draft.height<.01){resetDraft();return}el.saveBtn.disabled=false}
function renderDraft(){
 Object.assign(el.draftBox.style,{left:`${draft.x*100}%`,top:`${draft.y*100}%`,width:`${draft.width*100}%`,height:`${draft.height*100}%`});
 el.xVal.textContent=(draft.x*100).toFixed(1)+"%";el.yVal.textContent=(draft.y*100).toFixed(1)+"%";el.wVal.textContent=(draft.width*100).toFixed(1)+"%";el.hVal.textContent=(draft.height*100).toFixed(1)+"%";
}
function resetDraft(){draft=null;drawing=false;el.draftBox.hidden=true;el.saveBtn.disabled=true;el.xVal.textContent=el.yVal.textContent=el.wVal.textContent=el.hVal.textContent="-"}
async function saveRegion(){
 const r=await fetch(`/api/admin/references/${currentReferenceId}/regions`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({label:el.roiLabel.value||"스티커 영역",...draft})});
 if(!r.ok)return;
 resetDraft();await loadRegions();await loadReferences()
}
async function loadRegions(){
 const r=await fetch(`/api/admin/references/${currentReferenceId}/regions`);
 const d=await r.json();const items=d.items||[];
 el.savedLayer.innerHTML=items.map(i=>`<div class="roi-box" data-label="${esc(i.label)}" style="left:${i.x*100}%;top:${i.y*100}%;width:${i.width*100}%;height:${i.height*100}%"></div>`).join("");
 el.regionList.innerHTML=items.map(i=>`<div class="region-row"><div><strong>${esc(i.label)}</strong></div><button onclick="deleteRegion(${i.id})">삭제</button></div>`).join("")||"<div class='placeholder'>저장된 검사영역 없음</div>";
}
window.deleteRegion=async function(id){await fetch(`/api/admin/regions/${id}`,{method:"DELETE"});await loadRegions();await loadReferences()}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function jsEsc(v){return String(v).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
