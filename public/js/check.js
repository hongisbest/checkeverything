const $=id=>document.getElementById(id);
const S={refs:[],ref:null,stream:null,blob:null,analysis:null};
document.addEventListener("DOMContentLoaded",()=>{bind();restore();loadConfig()});

function bind(){
  $("startCameraBtn").onclick=startCamera;
  $("captureBtn").onclick=captureVideo;
  $("photoInput").onchange=pickFile;
  $("submitBtn").onclick=submitInspection;
  ["employeeName","employeeId","department","vehicleNo"].forEach(id=>$(id).oninput=saveProfile);
}

async function loadConfig(){
  try{
    const r=await fetchTimeout("/api/config",{},15000),d=await r.json();
    if(!r.ok)throw new Error(d.error||"기준사진 조회 실패");
    S.refs=d.references||[];
    $("configStatus").textContent=S.refs.length?`${S.refs.length}개 방향`:"기준사진 없음";
    $("refTabs").innerHTML=S.refs.map(x=>`<button class="ref-tab" data-id="${x.id}">${view(x.view_type)}</button>`).join("");
    document.querySelectorAll(".ref-tab").forEach(b=>b.onclick=()=>selectRef(Number(b.dataset.id)));
    if(S.refs[0])selectRef(S.refs[0].id);
    else $("referenceStage").innerHTML='<div class="camera-placeholder"><strong>관리자가 기준사진을 등록해야 합니다.</strong></div>';
  }catch(e){$("configStatus").textContent="오류";$("referenceStage").innerHTML=`<div class="camera-placeholder"><strong>${esc(e.message)}</strong></div>`}
}

function selectRef(id){
  S.ref=S.refs.find(x=>x.id===id);if(!S.ref)return;
  S.blob=null;S.analysis=null;$("analysisSection").classList.add("hidden");
  document.querySelectorAll(".ref-tab").forEach(b=>b.classList.toggle("active",Number(b.dataset.id)===id));
  $("referenceTitle").textContent=S.ref.title;
  $("guideText").textContent=S.ref.guide_text||"차량 전체가 기준사진과 비슷한 크기·각도가 되도록 촬영해 주세요.";
  $("referenceStage").innerHTML=`<img src="${S.ref.image_url}?v=${Date.now()}">`;
  S.ref.regions.forEach(x=>drawRoi($("referenceStage"),x));
  $("cameraOverlay").src=S.ref.image_url;$("cameraOverlay").style.display="block";
}

function drawRoi(parent,x){
  const b=document.createElement("div");b.className="roi-box";
  b.style.cssText=`left:${x.x*100}%;top:${x.y*100}%;width:${x.width*100}%;height:${x.height*100}%`;
  b.innerHTML=`<span>${esc(x.label)}</span>`;parent.appendChild(b);
}

async function startCamera(){
  stopCamera();
  try{
    S.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}}});
    $("cameraVideo").srcObject=S.stream;await $("cameraVideo").play();
    $("cameraVideo").style.display="block";$("cameraPlaceholder").style.display="none";
    $("captureBtn").disabled=false;$("cameraStatus").textContent="LIVE";
  }catch(e){$("cameraStatus").textContent="카메라 실패"}
}
function stopCamera(){if(S.stream)S.stream.getTracks().forEach(t=>t.stop());S.stream=null}
async function captureVideo(){
  const v=$("cameraVideo");if(!S.stream||v.readyState<2)return;
  const c=$("captureCanvas");c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0);
  const b=await new Promise(r=>c.toBlob(r,"image/jpeg",.88));await preparePhoto(b);
}
async function pickFile(e){
  const f=e.target.files?.[0];if(!f)return;
  try{await preparePhoto(await compressImage(f,1600,.88))}catch(err){alert("사진을 읽지 못했습니다. 다른 이미지로 다시 시도해 주세요.")}
}
async function preparePhoto(blob){
  if(!S.ref){alert("먼저 기준사진을 선택해 주세요.");return}
  S.blob=blob;const u=URL.createObjectURL(blob);
  $("resultStage").innerHTML=`<img src="${u}" alt="점검사진">`;
  $("analysisSection").classList.remove("hidden");
  try{S.analysis=await analyze();renderAnalysis(S.analysis)}
  catch(e){console.error(e);$("resultStatus").textContent="분석 실패";$("findings").innerHTML='<div class="finding">사진 비교 중 오류가 발생했습니다.</div>'}
  $("analysisSection").scrollIntoView({behavior:"smooth"});
}

async function analyze(){
  const reference=await loadImage(S.ref.image_url), current=await blobImage(S.blob);
  const noRegions=S.ref.regions.length===0;
  const regions=noRegions?[{label:"관리자 검증영역 미설정",x:.12,y:.16,width:.76,height:.68}]:S.ref.regions;
  const results=regions.map(g=>compareRegion(reference,current,g));
  const avg=mean(results.map(x=>x.score)),min=Math.min(...results.map(x=>x.score));
  let score=clamp(avg*.75+min*.25,0,100),findings=[];
  results.forEach(x=>{
    if(x.score>=82)return;
    if(x.shift>=5)findings.push(`${x.label}: 위치 어긋남 의심`);
    if(x.edge<.58)findings.push(`${x.label}: 스티커 탈락 또는 큰 훼손 의심`);
    else if(x.color>38)findings.push(`${x.label}: 변색·오염 의심`);
    else findings.push(`${x.label}: 형상 변화 확인 필요`);
  });
  if(noRegions){findings.unshift("관리자 검증영역이 설정되지 않아 전체영역으로 임시 비교했습니다.");score=Math.min(score,79)}
  if(!findings.length)findings.push("뚜렷한 이상징후가 없습니다.");
  return{score:r1(score),status:(score>=80&&min>=72&&!noRegions)?"정상":"확인필요",findings:[...new Set(findings)],metrics:{shape:r1(mean(results.map(x=>x.shape))),color:r1(mean(results.map(x=>x.color))),shift:Math.max(...results.map(x=>x.shift)),regions:results}};
}

function compareRegion(a,b,g){
  const size=80,A=crop(a,g,size,0,0);let best={mad:1e9,dx:0,dy:0,color:0,edge:1};
  for(let dy=-6;dy<=6;dy+=3)for(let dx=-6;dx<=6;dx+=3){
    const B=crop(b,g,size,dx/size,dy/size),m=metrics(A,B);if(m.mad<best.mad)best={...m,dx,dy};
  }
  const shape=clamp(100-best.mad*1.2,0,100),shift=Math.round(Math.hypot(best.dx,best.dy));
  return{label:g.label,shape:r1(shape),color:r1(best.color),edge:r2(best.edge),shift,score:r1(clamp(shape-best.color*.5-Math.abs(1-best.edge)*32-shift*1.5,0,100))};
}
function crop(img,g,size,dx,dy){
  const c=document.createElement("canvas");c.width=c.height=size;
  const x=clamp(g.x+dx*g.width,0,1-g.width),y=clamp(g.y+dy*g.height,0,1-g.height);
  c.getContext("2d").drawImage(img,x*img.naturalWidth,y*img.naturalHeight,g.width*img.naturalWidth,g.height*img.naturalHeight,0,0,size,size);
  return c.getContext("2d").getImageData(0,0,size,size);
}
function metrics(a,b){
  const A=a.data,B=b.data,n=A.length/4;let al=0,bl=0;
  for(let i=0;i<A.length;i+=4){al+=.299*A[i]+.587*A[i+1]+.114*A[i+2];bl+=.299*B[i]+.587*B[i+1]+.114*B[i+2]}
  al/=n;bl/=n;const brightness=bl-al;let mad=0,color=0,ea=0,eb=0,s=Math.round(Math.sqrt(n));
  for(let y=0;y<s-1;y++)for(let x=0;x<s-1;x++){
    const p=(y*s+x)*4,r=p+4,dn=p+s*4,la=.299*A[p]+.587*A[p+1]+.114*A[p+2],lb=.299*B[p]+.587*B[p+1]+.114*B[p+2];
    mad+=Math.abs(la-(lb-brightness));color+=(Math.abs(A[p]-B[p])+Math.abs(A[p+1]-B[p+1])+Math.abs(A[p+2]-B[p+2]))/3;
    const ga=Math.abs(la-(.299*A[r]+.587*A[r+1]+.114*A[r+2]))+Math.abs(la-(.299*A[dn]+.587*A[dn+1]+.114*A[dn+2]));
    const gb=Math.abs(lb-(.299*B[r]+.587*B[r+1]+.114*B[r+2]))+Math.abs(lb-(.299*B[dn]+.587*B[dn+1]+.114*B[dn+2]));
    if(ga>32)ea++;if(gb>32)eb++;
  }
  return{mad:mad/n,color:color/n,edge:ea>5?eb/ea:1};
}
function renderAnalysis(a){
  $("resultStatus").textContent=a.status;$("resultStatus").className=`badge ${a.status==="정상"?"pill normal":"pill review"}`;
  $("scoreValue").textContent=a.score;$("shapeValue").textContent=a.metrics.shape;$("colorValue").textContent=a.metrics.color;$("shiftValue").textContent=`${a.metrics.shift}px`;
  $("findings").innerHTML=a.findings.map(x=>`<div class="finding ${a.status==="정상"?"ok":""}">${esc(x)}</div>`).join("");
}

async function submitInspection(){
  if(!S.blob||!S.analysis){setMessage("사진 분석을 먼저 완료해 주세요.","error");return}
  const name=$("employeeName").value.trim(),vehicle=$("vehicleNo").value.trim();
  if(!name||!vehicle){setMessage("성명과 차량번호를 입력해 주세요.","error");return}
  const meta={employee_name:name,employee_id:$("employeeId").value.trim(),department:$("department").value.trim(),vehicle_no:vehicle,reference_id:S.ref.id,score:S.analysis.score,status:S.analysis.status,findings:S.analysis.findings,metrics:S.analysis.metrics};
  const fd=new FormData();fd.append("meta",JSON.stringify(meta));fd.append("file",S.blob,"inspection.jpg");
  $("submitBtn").disabled=true;setMessage("저장 중입니다. 최대 30초까지 기다려 주세요.","info");
  try{
    const r=await fetchTimeout("/api/inspection",{method:"POST",body:fd},30000),d=await r.json();
    if(!r.ok)throw new Error(d.error||"저장 실패");
    setMessage(`제출 완료 · 접수번호 #${d.id}`,"success");
  }catch(e){setMessage(`${e.message} 다시 시도해 주세요.`,"error")}
  finally{$("submitBtn").disabled=false}
}
function setMessage(t,c){$("submitMessage").textContent=t;$("submitMessage").className=`message ${c}`}

async function compressImage(file,maxSide,quality){
  const img=await blobImage(file),scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error("이미지 변환 실패")),"image/jpeg",quality));
}
function blobImage(blob){return new Promise((resolve,reject)=>{const u=URL.createObjectURL(blob),i=new Image();i.onload=()=>{URL.revokeObjectURL(u);resolve(i)};i.onerror=()=>{URL.revokeObjectURL(u);reject(new Error("이미지 로드 실패"))};i.src=u})}
function loadImage(url){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error("기준사진 로드 실패"));i.src=`${url}?v=${Date.now()}`})}
function fetchTimeout(url,opts={},ms=20000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);return fetch(url,{...opts,signal:c.signal}).catch(e=>{if(e.name==="AbortError")throw new Error("서버 응답시간을 초과했습니다.");throw e}).finally(()=>clearTimeout(t))}
function saveProfile(){localStorage.setItem("vc2_profile",JSON.stringify({employeeName:$("employeeName").value,employeeId:$("employeeId").value,department:$("department").value,vehicleNo:$("vehicleNo").value}))}
function restore(){try{const p=JSON.parse(localStorage.getItem("vc2_profile")||"{}");Object.keys(p).forEach(k=>$(k)&&($(k).value=p[k]||""))}catch{}}
function view(v){return({driver_side:"운전석 측면",passenger_side:"조수석 측면",rear:"후면",front:"전면"})[v]||v}
function mean(a){return a.reduce((x,y)=>x+y,0)/(a.length||1)}function clamp(v,a,b){return Math.min(b,Math.max(a,v))}function r1(v){return Math.round(v*10)/10}function r2(v){return Math.round(v*100)/100}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
