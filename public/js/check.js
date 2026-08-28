const el = {
  referencePreview: document.getElementById("referencePreview"),
  referenceStatus: document.getElementById("referenceStatus"),
  referenceTitle: document.getElementById("referenceTitle"),
  overlayImage: document.getElementById("overlayImage"),
  cameraViewport: document.getElementById("cameraViewport"),
  cameraVideo: document.getElementById("cameraVideo"),
  cameraPlaceholder: document.getElementById("cameraPlaceholder"),
  cameraStatus: document.getElementById("cameraStatus"),
  cameraMessage: document.getElementById("cameraMessage"),
  startCameraBtn: document.getElementById("startCameraBtn"),
  captureBtn: document.getElementById("captureBtn"),
  zoomSlider: document.getElementById("zoomSlider"),
  zoomValue: document.getElementById("zoomValue"),
  opacitySlider: document.getElementById("opacitySlider"),
  opacityValue: document.getElementById("opacityValue"),
  captureCanvas: document.getElementById("captureCanvas"),
  capturePreview: document.getElementById("capturePreview")
};

let stream = null;

loadReference();

el.startCameraBtn.addEventListener("click", startCamera);
el.captureBtn.addEventListener("click", capturePhoto);

el.zoomSlider.addEventListener("input", () => {
  const value = Number(el.zoomSlider.value);
  el.zoomValue.textContent = `${value.toFixed(2)}×`;
  el.cameraViewport.style.setProperty("--camera-scale", value);
});

el.opacitySlider.addEventListener("input", () => {
  const value = Number(el.opacitySlider.value);
  el.opacityValue.textContent = `${value}%`;
  el.overlayImage.style.opacity = String(value / 100);
});

window.addEventListener("beforeunload", stopCamera);

async function loadReference() {
  try {
    const res = await fetch("/api/reference/active?view_type=driver_side", { cache: "no-store" });
    const data = await res.json();

    if (!data.ok || !data.item) {
      el.referenceStatus.textContent = "미등록";
      el.referencePreview.innerHTML = `
        <div class="placeholder">
          <strong>등록된 기준사진이 없습니다.</strong>
          <span>관리자에게 기준사진 등록을 요청해 주세요.</span>
        </div>`;
      return;
    }

    const imageUrl = `${data.item.image_url}?v=${encodeURIComponent(data.item.created_at)}`;
    el.referencePreview.innerHTML = `<img src="${imageUrl}" alt="${escapeHtml(data.item.title)}">`;
    el.overlayImage.src = imageUrl;
    el.overlayImage.style.display = "block";
    el.referenceTitle.textContent = data.item.title;
    el.referenceStatus.textContent = "준비완료";
  } catch {
    el.referenceStatus.textContent = "오류";
    el.referencePreview.innerHTML = `<div class="placeholder"><strong>기준사진을 불러오지 못했습니다.</strong></div>`;
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return message("이 브라우저는 카메라 기능을 지원하지 않습니다.", "error");
  }

  stopCamera();

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    el.cameraVideo.srcObject = stream;
    await el.cameraVideo.play();

    el.cameraVideo.style.display = "block";
    el.cameraPlaceholder.style.display = "none";
    el.captureBtn.disabled = false;
    el.cameraStatus.textContent = "LIVE";
    message("카메라가 연결되었습니다.", "success");
  } catch (error) {
    console.error(error);
    el.cameraStatus.textContent = "실패";
    message(`카메라 연결에 실패했습니다. (${error.name})`, "error");
  }
}

function capturePhoto() {
  if (!stream || el.cameraVideo.readyState < 2) {
    return message("카메라가 준비되지 않았습니다.", "error");
  }

  const w = el.cameraVideo.videoWidth;
  const h = el.cameraVideo.videoHeight;
  el.captureCanvas.width = w;
  el.captureCanvas.height = h;

  const ctx = el.captureCanvas.getContext("2d");
  ctx.drawImage(el.cameraVideo, 0, 0, w, h);

  const imageUrl = el.captureCanvas.toDataURL("image/jpeg", 0.9);
  el.capturePreview.innerHTML = `<img src="${imageUrl}" alt="촬영 결과">`;
  message("촬영이 완료되었습니다. 다음 단계에서 자동 비교 기능을 연결합니다.", "success");
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  el.cameraVideo.srcObject = null;
}

function message(text, type) {
  el.cameraMessage.textContent = text;
  el.cameraMessage.className = `message ${type}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}
