const ref=document.getElementById("referencePreview"),title=document.getElementById("referenceTitle"),
video=document.getElementById("cameraVideo"),overlay=document.getElementById("overlayImage"),
ph=document.getElementById("cameraPlaceholder"),startBtn=document.getElementById("startCameraBtn"),
captureBtn=document.getElementById("captureBtn"),canvas=document.getElementById("captureCanvas"),
capturePreview=document.getElementById("capturePreview"),msg=document.getElementById("cameraMessage");
let stream=null;

loadReference();

async function loadReference(){
 const r=await fetch("/api/reference/active");
 const d=await r.json();
 if(!d.item){ref.innerHTML="<div class='placeholder'>기준사진 없음</div>";return}
 const u=d.item.image_url;
 ref.innerHTML=`<img src="${u}">`;
 overlay.src=u;overlay.style.display="block";title.textContent=d.item.title;
 const rr=await fetch(`/api/reference/${d.item.id}/regions`);
 const rd=await rr.json();
 (rd.items||[]).forEach(i=>{
  const b=document.createElement("div");b.className="public-roi";
  b.style.left=`${i.x*100}%`;b.style.top=`${i.y*100}%`;b.style.width=`${i.width*100}%`;b.style.height=`${i.height*100}%`;
  ref.appendChild(b);
 });
}
startBtn.onclick=async()=>{
 stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"}}});
 video.srcObject=stream;await video.play();video.style.display="block";ph.style.display="none";captureBtn.disabled=false;
};
captureBtn.onclick=()=>{
 const w=video.videoWidth,h=video.videoHeight;canvas.width=w;canvas.height=h;
 canvas.getContext("2d").drawImage(video,0,0,w,h);
 capturePreview.innerHTML=`<img src="${canvas.toDataURL("image/jpeg",.9)}">`;
 msg.textContent="촬영 완료. 다음 단계에서 이 사진과 ROI를 자동 비교합니다.";
};
