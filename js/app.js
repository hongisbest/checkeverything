const referenceInput = document.getElementById("referenceInput");
const referencePreview = document.getElementById("referencePreview");
const overlayImage = document.getElementById("overlayImage");

const cameraVideo = document.getElementById("cameraVideo");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const cameraStatus = document.getElementById("cameraStatus");
const cameraMessage = document.getElementById("cameraMessage");

const startCameraBtn = document.getElementById("startCameraBtn");
const switchCameraBtn = document.getElementById("switchCameraBtn");
const captureBtn = document.getElementById("captureBtn");

const opacitySlider = document.getElementById("opacitySlider");
const opacityValue = document.getElementById("opacityValue");

const captureCanvas = document.getElementById("captureCanvas");
const capturePreview = document.getElementById("capturePreview");

let mediaStream = null;
let facingMode = "environment";
let referenceDataUrl = null;

referenceInput.addEventListener("change", handleReferenceImage);
startCameraBtn.addEventListener("click", startCamera);
switchCameraBtn.addEventListener("click", switchCamera);
captureBtn.addEventListener("click", capturePhoto);

opacitySlider.addEventListener("input", () => {
  const value = Number(opacitySlider.value);
  opacityValue.textContent = `${value}%`;
  overlayImage.style.opacity = String(value / 100);
});

window.addEventListener("beforeunload", stopCamera);

function handleReferenceImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("이미지 파일만 선택해 주세요.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = (loadEvent) => {
    referenceDataUrl = loadEvent.target.result;

    referencePreview.innerHTML = "";
    const preview = document.createElement("img");
    preview.src = referenceDataUrl;
    preview.alt = "정상 기준사진";
    referencePreview.appendChild(preview);

    overlayImage.src = referenceDataUrl;
    overlayImage.style.display = "block";
  };

  reader.readAsDataURL(file);
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showMessage(
      "이 브라우저에서는 웹 카메라 기능을 지원하지 않습니다. 최신 Chrome, Safari 또는 Edge에서 다시 접속해 주세요.",
      "error"
    );
    return;
  }

  if (!window.isSecureContext) {
    showMessage(
      "카메라 접근은 HTTPS 보안 연결에서만 가능합니다. Cloudflare의 https:// 주소로 접속해 주세요.",
      "error"
    );
    return;
  }

  stopCamera();

  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    cameraVideo.srcObject = mediaStream;

    await cameraVideo.play();

    cameraVideo.style.display = "block";
    cameraPlaceholder.style.display = "none";

    captureBtn.disabled = false;
    switchCameraBtn.disabled = false;

    cameraStatus.textContent = facingMode === "environment" ? "후면 카메라" : "전면 카메라";
    startCameraBtn.textContent = "카메라 다시 시작";

    showMessage(
      "카메라가 연결되었습니다. 차량을 기준사진에 맞춘 뒤 촬영하세요.",
      "success"
    );
  } catch (error) {
    console.error(error);

    let message = "카메라를 시작하지 못했습니다.";

    if (error.name === "NotAllowedError") {
      message = "카메라 권한이 차단되어 있습니다. 브라우저 사이트 설정에서 카메라 권한을 허용한 뒤 다시 시도해 주세요.";
    } else if (error.name === "NotFoundError") {
      message = "사용 가능한 카메라를 찾지 못했습니다.";
    } else if (error.name === "NotReadableError") {
      message = "다른 앱이 카메라를 사용 중이거나 기기에서 카메라 접근을 막고 있습니다. 카메라 앱을 종료한 뒤 다시 시도해 주세요.";
    } else if (error.name === "OverconstrainedError") {
      message = "현재 기기에서 요청한 카메라 조건을 사용할 수 없습니다. 다른 카메라로 다시 시도해 주세요.";
    }

    showMessage(message, "error");
    cameraStatus.textContent = "연결 실패";
  }
}

async function switchCamera() {
  facingMode = facingMode === "environment" ? "user" : "environment";
  await startCamera();
}

function capturePhoto() {
  if (!mediaStream || cameraVideo.readyState < 2) {
    showMessage("카메라 화면이 준비되지 않았습니다.", "error");
    return;
  }

  const sourceWidth = cameraVideo.videoWidth;
  const sourceHeight = cameraVideo.videoHeight;

  if (!sourceWidth || !sourceHeight) {
    showMessage("카메라 해상도를 확인할 수 없습니다.", "error");
    return;
  }

  captureCanvas.width = sourceWidth;
  captureCanvas.height = sourceHeight;

  const ctx = captureCanvas.getContext("2d");

  if (facingMode === "user") {
    ctx.save();
    ctx.translate(sourceWidth, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(cameraVideo, 0, 0, sourceWidth, sourceHeight);
    ctx.restore();
  } else {
    ctx.drawImage(cameraVideo, 0, 0, sourceWidth, sourceHeight);
  }

  const imageUrl = captureCanvas.toDataURL("image/jpeg", 0.9);

  capturePreview.innerHTML = "";
  const resultImage = document.createElement("img");
  resultImage.src = imageUrl;
  resultImage.alt = "촬영한 차량사진";
  capturePreview.appendChild(resultImage);

  capturePreview.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  showMessage(
    "촬영이 완료되었습니다. 아래 기준사진과 촬영사진을 비교해 주세요.",
    "success"
  );
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  cameraVideo.srcObject = null;
}

function showMessage(text, type) {
  cameraMessage.textContent = text;
  cameraMessage.className = `message ${type}`;
}
