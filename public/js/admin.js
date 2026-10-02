const $=id=>document.getElementById(id);
const S={refs:[],refId:null,drawing:false,start:null,draft:null};

document.addEventListener("DOMContentLoaded",()=>{bind();checkSession()});
function bind(){
  $("loginBtn").onclick=login;$("password").onkeydown=e=>{if(e.key==="Enter")login()};
  $("logoutBtn").onclick=logout;$("uploadRefBtn").onclick=uploadReference;$("refreshRefBtn").onclick=loadReferences;
  $("refFile").onchange=previewReference;$("closeRoiBtn").onclick=closeRoi;$("saveRegionBtn").onclick=saveRegion;$("resetRegionBtn").onclick=resetDraft;$("searchBtn").onclick=loadInspections;
  $("imageModalClose").onclick=closeImageModal;
  document.querySelector("[data-close-modal]").onclick=closeImageModal;
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeImageModal()});
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $("roiCanvas").addEventListener("pointerdown",startDraw);$("roiCanvas").addEventListener("pointermove",moveDraw);window.addEventListener("pointerup",endDraw);
}

async function checkSession(){
  try{const r=await fetchTimeout("/api/admin/me",{},12000);r.ok?showAdmin():showLogin()}catch{showLogin()}
}
function showLogin(){$("loginPanel").classList.remove("hidden");$("adminPanel").classList.add("hidden")}
function showAdmin(){$("loginPanel").classList.add("hidden");$("adminPanel").classList.remove("hidden");switchView("references");loadReferences()}
async function login(){
  try{
    const r=await fetchTimeout("/api/admin/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:$("password").value})},15000),d=await r.json();
    if(!r.ok)throw new Error(d.error||"로그인 실패");$("password").value="";showAdmin();
  }catch(e){setMsg("loginMessage",e.message,"error")}
}
async function logout(){try{await fetchTimeout("/api/admin/logout",{method:"POST"},10000)}catch{}showLogin()}
function switchView(v){
  $("referencesView").classList.toggle("hidden",v!=="references");$("resultsView").classList.toggle("hidden",v!=="results");
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("primary",b.dataset.view===v));if(v==="results")loadInspections();
}

async function previewReference(){
  const f=$("refFile").files[0];if(!f){$("refPreview").classList.add("hidden");return}
  try{const b=await compressImage(f,1600,.88),u=URL.createObjectURL(b);$("refPreview").innerHTML=`<img src="${u}">`;$("refPreview").classList.remove("hidden")}catch{$("refPreview").classList.add("hidden")}
}
async function uploadReference(){
  const title=$("refTitle").value.trim(),file=$("refFile").files[0];if(!title||!file){setMsg("uploadRefMessage","기준사진명과 사진을 입력해 주세요.","error");return}
  $("uploadRefBtn").disabled=true;setMsg("uploadRefMessage","이미지를 최적화하고 등록 중입니다...","info");
  try{
    const optimized=await compressImage(file,1600,.88);
    const fd=new FormData();fd.append("title",title);fd.append("view_type",$("viewType").value);fd.append("guide_text",$("guideTextInput").value.trim());fd.append("file",optimized,"reference.jpg");
    const r=await fetchTimeout("/api/admin/references",{method:"POST",body:fd},30000),d=await r.json();
    if(!r.ok)throw new Error(d.error||"등록 실패");
    $("refTitle").value="";$("refFile").value="";$("refPreview").classList.add("hidden");$("refPreview").innerHTML="";
    setMsg("uploadRefMessage","등록 완료. 기존 사진과 점검 데이터는 그대로 보존됩니다.","success");await loadReferences();
  }catch(e){setMsg("uploadRefMessage",`${e.message} 다시 시도해 주세요.`,"error")}
  finally{$("uploadRefBtn").disabled=false}
}

async function loadReferences(){
  $("referenceList").innerHTML='<div class="empty">불러오는 중...</div>';
  try{
    const r=await fetchTimeout("/api/admin/references",{cache:"no-store"},15000),d=await r.json();
    if(r.status===401)return showLogin();if(!r.ok)throw new Error(d.error||"목록 조회 실패");
    S.refs=d.items||[];
    $("referenceList").innerHTML=S.refs.length?S.refs.map(x=>`<div class="reference-row"><img src="/api/reference/${x.id}/image?v=${Date.now()}"><div><strong>${esc(x.title)}</strong><div class="muted" style="font-size:12px;margin-top:4px">${view(x.view_type)} · 검증영역 ${Number(x.region_count||0)}개</div><div style="margin-top:5px">${Number(x.is_active)===1?'<span class="pill active">활성</span>':""}</div></div><div class="row-actions"><button class="btn small" onclick="openRoi(${x.id})">검증영역</button><button class="btn small" onclick="activateReference(${x.id})" ${Number(x.is_active)===1?"disabled":""}>활성화</button><button class="btn small danger" onclick="deleteReference(${x.id})">삭제</button></div></div>`).join(""):'<div class="empty">등록된 기준사진이 없습니다.</div>';
  }catch(e){$("referenceList").innerHTML=`<div class="message error">${esc(e.message)}</div>`}
}
window.activateReference=async id=>{try{const r=await fetchTimeout(`/api/admin/references/${id}/activate`,{method:"POST"},12000),d=await r.json();if(!r.ok)throw new Error(d.error||"활성화 실패");loadReferences()}catch(e){alert(e.message)}}
window.deleteReference=async id=>{if(!confirm("이 기준사진을 삭제할까요? 기존 점검결과와 연결되어 있으면 삭제되지 않습니다."))return;try{const r=await fetchTimeout(`/api/admin/references/${id}`,{method:"DELETE"},15000),d=await r.json();if(!r.ok)throw new Error(d.error||"삭제 실패");loadReferences()}catch(e){alert(e.message)}}

window.openRoi=async id=>{S.refId=id;resetDraft();$("roiImage").src=`/api/reference/${id}/image?v=${Date.now()}`;$("roiEditorSection").classList.remove("hidden");await loadRegions();$("roiEditorSection").scrollIntoView({behavior:"smooth"})}
function closeRoi(){S.refId=null;$("roiEditorSection").classList.add("hidden");resetDraft()}
function point(e){const r=$("roiCanvas").getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width,0,1),y:clamp((e.clientY-r.top)/r.height,0,1)}}
function startDraw(e){if(!S.refId)return;e.preventDefault();S.drawing=true;S.start=point(e);S.draft={x:S.start.x,y:S.start.y,width:0,height:0};$("draftRegion").classList.remove("hidden");renderDraft()}
function moveDraw(e){if(!S.drawing)return;const p=point(e);S.draft={x:Math.min(S.start.x,p.x),y:Math.min(S.start.y,p.y),width:Math.abs(p.x-S.start.x),height:Math.abs(p.y-S.start.y)};renderDraft()}
function endDraw(){if(!S.drawing)return;S.drawing=false;if(!S.draft||S.draft.width<.01||S.draft.height<.01){resetDraft();return}$("saveRegionBtn").disabled=false}
function renderDraft(){const d=S.draft;$("draftRegion").style.cssText=`left:${d.x*100}%;top:${d.y*100}%;width:${d.width*100}%;height:${d.height*100}%`;["roiX","roiY","roiW","roiH"].forEach((id,i)=>$(id).textContent=`${([d.x,d.y,d.width,d.height][i]*100).toFixed(1)}%`)}
function resetDraft(){S.drawing=false;S.start=null;S.draft=null;$("draftRegion").classList.add("hidden");$("saveRegionBtn").disabled=true;["roiX","roiY","roiW","roiH"].forEach(id=>$(id).textContent="-")}
async function saveRegion(){
  if(!S.refId||!S.draft)return;
  try{
    const r=await fetchTimeout(`/api/admin/references/${S.refId}/regions`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({label:$("regionLabel").value.trim()||"홍보 스티커",...S.draft})},12000),d=await r.json();
    if(!r.ok)throw new Error(d.error||"저장 실패");resetDraft();setMsg("roiMessage","검증영역 저장 완료","success");await loadRegions();await loadReferences();
  }catch(e){setMsg("roiMessage",e.message,"error")}
}
async function loadRegions(){
  try{
    const r=await fetchTimeout(`/api/admin/references/${S.refId}/regions`,{cache:"no-store"},12000),d=await r.json();if(!r.ok)throw new Error(d.error||"영역 조회 실패");const a=d.items||[];
    $("savedRegions").innerHTML=a.map(x=>`<div class="roi-saved" data-label="${esc(x.label)}" style="left:${x.x*100}%;top:${x.y*100}%;width:${x.width*100}%;height:${x.height*100}%"></div>`).join("");
    $("regionList").innerHTML=a.length?a.map(x=>`<div class="region-item"><strong>${esc(x.label)}</strong><button class="btn small danger" onclick="deleteRegion(${x.id})">삭제</button></div>`).join(""):'<div class="empty">검증영역 없음</div>';
  }catch(e){$("regionList").innerHTML=`<div class="message error">${esc(e.message)}</div>`}
}
window.deleteRegion=async id=>{if(!confirm("이 검증영역을 삭제할까요?"))return;try{await fetchTimeout(`/api/admin/regions/${id}`,{method:"DELETE"},12000);await loadRegions();await loadReferences()}catch(e){alert(e.message)}}

async function loadInspections(){
  $("inspectionList").innerHTML='<div class="empty">불러오는 중...</div>';
  const q=new URLSearchParams();if($("resultSearch").value.trim())q.set("q",$("resultSearch").value.trim());if($("statusFilter").value)q.set("status",$("statusFilter").value);if($("stateFilter").value)q.set("admin_state",$("stateFilter").value);
  try{
    const r=await fetchTimeout(`/api/admin/inspections?${q}`,{cache:"no-store"},15000),d=await r.json();if(!r.ok)throw new Error(d.error||"조회 실패");const a=d.items||[];
    $("countAll").textContent=a.length;$("countNormal").textContent=a.filter(x=>x.status==="정상").length;$("countReview").textContent=a.filter(x=>x.status==="확인필요").length;$("countAction").textContent=a.filter(x=>x.admin_state==="개선요청").length;
    $("inspectionList").innerHTML=a.length?a.map(x=>{let f=[];try{f=JSON.parse(x.findings_json||"[]")}catch{}return`<div class="inspection-row"><div class="inspection-main"><img class="inspection-thumb" src="/api/admin/inspections/${x.id}/image" alt="${esc(x.vehicle_no)} 점검사진" onclick="openImageModal('/api/admin/inspections/${x.id}/image','${jsEsc(x.vehicle_no)} · ${jsEsc(x.employee_name)}')"><div class="inspection-meta"><strong>${esc(x.vehicle_no)} · ${esc(x.employee_name)}</strong><span>${esc(x.department||"-")} / ${view(x.view_type)}</span><span>점수 ${Number(x.score).toFixed(1)} · <b>${esc(x.status)}</b></span><span>${esc(f.join(" / "))}</span><span class="muted">${esc(x.created_at)}</span></div></div><div class="detail-actions"><select id="state-${x.id}">${["미확인","확인완료","개선요청","조치완료"].map(v=>`<option ${x.admin_state===v?"selected":""}>${v}</option>`).join("")}</select><textarea id="note-${x.id}" placeholder="관리자 메모">${esc(x.admin_note||"")}</textarea><button class="btn small primary" onclick="saveInspection(${x.id})">저장</button></div></div>`}).join(""):'<div class="empty">점검결과가 없습니다.</div>';
  }catch(e){$("inspectionList").innerHTML=`<div class="message error">${esc(e.message)}</div>`}
}
window.saveInspection=async id=>{try{const r=await fetchTimeout(`/api/admin/inspections/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({admin_state:$(`state-${id}`).value,admin_note:$(`note-${id}`).value})},12000),d=await r.json();if(!r.ok)throw new Error(d.error||"저장 실패");loadInspections()}catch(e){alert(e.message)}}

async function compressImage(file,maxSide,quality){
  const img=await blobImage(file),scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error("이미지 최적화 실패")),"image/jpeg",quality));
}
function blobImage(blob){return new Promise((resolve,reject)=>{const u=URL.createObjectURL(blob),i=new Image();i.onload=()=>{URL.revokeObjectURL(u);resolve(i)};i.onerror=()=>{URL.revokeObjectURL(u);reject(new Error("이미지를 읽지 못했습니다."))};i.src=u})}
function fetchTimeout(url,opts={},ms=20000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);return fetch(url,{...opts,signal:c.signal}).catch(e=>{if(e.name==="AbortError")throw new Error("서버 응답시간을 초과했습니다.");throw e}).finally(()=>clearTimeout(t))}

window.openImageModal=(src,caption="")=>{
  $("imageModalImg").src=src;
  $("imageModalCaption").textContent=caption;
  $("imageModal").classList.remove("hidden");
  document.body.style.overflow="hidden";
};
function closeImageModal(){
  const modal=$("imageModal");
  if(!modal||modal.classList.contains("hidden"))return;
  modal.classList.add("hidden");
  $("imageModalImg").src="";
  $("imageModalCaption").textContent="";
  document.body.style.overflow="";
}

function setMsg(id,t,c){$(id).textContent=t;$(id).className=`message ${c}`}
function view(v){return({driver_side:"운전석 측면",passenger_side:"조수석 측면",rear:"후면",front:"전면"})[v]||v}
function clamp(v,a,b){return Math.min(b,Math.max(a,v))}
function jsEsc(v){return String(v??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/\n/g," ")}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
