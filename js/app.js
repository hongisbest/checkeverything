const referenceInput = document.getElementById("referenceInput");
const referencePreview = document.getElementById("referencePreview");
const overlayImage = document.getElementById("overlayImage");

const cameraVideo = document.getElementById("cameraVideo");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const cameraStatus = document.getElementById("cameraStatus");
const cameraMessage = document.getElementById("cameraMessage");

const startCameraBtn = document.getElementById("startCameraBtn");
const frontCameraBtn = document.getElementById("frontCameraBtn");
const backCameraBtn = document.getElementById("backCameraBtn");
const captureBtn = document.getElementById("captureBtn");

const cameraCount = document.getElementById("cameraCount");
const cameraName = document.getElementById("cameraName");
const facingModeText = document.getElementById("facingModeText");
const resolutionText = document.getElementById("resolutionText");
const streamState = document.getElementById("streamState");

const opacitySlider = document.getElementById("opacitySlider");
const opacityValue = document.getElementById("opacityValue");

const captureCanvas = document.getElementById("captureCanvas");
const capturePreview = document.getElementById("capturePreview");

let mediaStream = null;
let videoDevices = [];
let currentFacing = "environment";
let referenceDataUrl = null;

referenceInput.addEventListener("change", handleReferenceImage);
startCameraBtn.addEventListener("click", initialStart);
frontCameraBtn.addEventListener("click", () => openPreferredCamera("user"));
backCameraBtn.addEventListener("click", () => openPreferredCamera("environment"));
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
  reader.onload = (e) => {
    referenceDataUrl = e.target.result;

    referencePreview.innerHTML = "";
    const img = document.createElement("img");
    img.src = referenceDataUrl;
    img.alt = "정상 기준사진";
    referencePreview.appendChild(img);

    overlayImage.src = referenceDataUrl;
    overlayImage.style.display = "block";
  };
  reader.readAsDataURL(file);
}

async function initialStart() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage("이 브라우저는 웹 카메라 기능을 지원하지 않습니다.", "error");
    return;
  }

  if (!window.isSecureContext) {
    showMessage("카메라는 HTTPS 환경에서만 사용할 수 있습니다.", "error");
    return;
  }

  // iOS/Safari는 권한 전에는 enumerateDevices의 label이 비어 있는 경우가 많음.
  // 먼저 후면 선호로 권한/스트림을 확보한 뒤 장치 목록을 다시 조회한다.
  await openPreferredCamera("environment", true);
}

async function refreshDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = devices.filter((d) => d.kind === "videoinput");
    cameraCount.textContent = `${videoDevices.length}개`;
    frontCameraBtn.disabled = videoDevices.length < 1;
    backCameraBtn.disabled = videoDevices.length < 1;
  } catch (err) {
    console.error(err);
    cameraCount.textContent = "확인 실패";
  }
}

async function openPreferredCamera(facing, firstRun = false) {
  currentFacing = facing;
  stopCamera();

  setDiagLoading(facing);

  // 1차: facingMode exact로 요청
  let stream = null;
  let firstError = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { exact: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
  } catch (err) {
    firstError = err;
  }

  // 2차: exact 실패 시 ideal로 fallback
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
    } catch (err) {
      return handleCameraError(err || firstError);
    }
  }

  mediaStream = stream;

  try {
    cameraVideo.srcObject = mediaStream;

    await new Promise((resolve) => {
      if (cameraVideo.readyState >= 1) {
        resolve();
        return;
      }
      cameraVideo.onloadedmetadata = () => resolve();
    });

    await cameraVideo.play();

    cameraVideo.style.display = "block";
    cameraPlaceholder.style.display = "none";

    captureBtn.disabled = false;
    frontCameraBtn.disabled = false;
    backCameraBtn.disabled = false;
    startCameraBtn.textContent = "카메라 다시 시작";

    await refreshDevices();
    updateDiagnostics();

    showMessage(
      `${facing === "environment" ? "후면" : "전면"} 카메라 요청이 완료되었습니다. 아래 '현재 카메라'와 Facing Mode를 확인해 주세요.`,
      "success"
    );

    // iOS에서 첫 권한 이후 장치 label이 채워질 수 있으므로 진단 갱신
    setTimeout(async () => {
      await refreshDevices();
      updateDiagnostics();
    }, 500);

  } catch (err) {
    console.error(err);
    handleCameraError(err);
  }
}

function updateDiagnostics() {
  if (!mediaStream) return;

  const track = mediaStream.getVideoTracks()[0];
  const settings = track?.getSettings ? track.getSettings() : {};
  const label = track?.label || "이름 확인 불가";

  cameraName.textContent = label;
  facingModeText.textContent = settings.facingMode || currentFacing || "-";
  resolutionText.textContent =
    settings.width && settings.height ? `${settings.width} × ${settings.height}` : "-";
  streamState.textContent = track?.readyState === "live" ? "LIVE" : (track?.readyState || "-");
  cameraStatus.textContent = track?.readyState === "live" ? "LIVE" : "연결됨";
}

function setDiagLoading(facing) {
  cameraName.textContent = "연결 중";
  facingModeText.textContent = facing;
  resolutionText.textContent = "-";
  streamState.textContent = "STARTING";
  cameraStatus.textContent = "연결 중";
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  cameraVideo.srcObject = null;
}

function handleCameraError(error) {
  console.error(error);

  let message = `카메라를 시작하지 못했습니다. (${error?.name || "UnknownError"})`;

  if (error?.name === "NotAllowedError") {
    message = "카메라 권한이 차단되어 있습니다. 사이트 카메라 권한을 허용한 뒤 다시 시도해 주세요.";
  } else if (error?.name === "NotFoundError") {
    message = "사용 가능한 카메라를 찾지 못했습니다.";
  } else if (error?.name === "NotReadableError") {
    message = "카메라를 읽을 수 없습니다. 다른 앱이 카메라를 사용 중인지 확인해 주세요.";
  } else if (error?.name === "OverconstrainedError") {
    message = "해당 전면/후면 카메라 조건을 사용할 수 없습니다.";
  }

  streamState.textContent = "ERROR";
  cameraStatus.textContent = "실패";
  showMessage(message, "error");
}

function capturePhoto() {
  if (!mediaStream || cameraVideo.readyState < 2) {
    showMessage("카메라 화면이 준비되지 않았습니다.", "error");
    return;
  }

  const width = cameraVideo.videoWidth;
  const height = cameraVideo.videoHeight;

  if (!width || !height) {
    showMessage("카메라 해상도를 확인할 수 없습니다.", "error");
    return;
  }

  captureCanvas.width = width;
  captureCanvas.height = height;

  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(cameraVideo, 0, 0, width, height);

  const imageUrl = captureCanvas.toDataURL("image/jpeg", 0.9);

  capturePreview.innerHTML = "";
  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = "촬영한 차량사진";
  capturePreview.appendChild(img);

  capturePreview.scrollIntoView({ behavior: "smooth", block: "center" });
  showMessage("촬영이 완료되었습니다.", "success");
}

function showMessage(text, type) {
  cameraMessage.textContent = text;
  cameraMessage.className = `message ${type}`;
}
