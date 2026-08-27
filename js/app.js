const els = {
  referenceInput: document.getElementById("referenceInput"),
  referencePreview: document.getElementById("referencePreview"),
  overlayImage: document.getElementById("overlayImage"),
  cameraVideo: document.getElementById("cameraVideo"),
  cameraPlaceholder: document.getElementById("cameraPlaceholder"),
  cameraStatus: document.getElementById("cameraStatus"),
  cameraMessage: document.getElementById("cameraMessage"),
  startCameraBtn: document.getElementById("startCameraBtn"),
  frontCameraBtn: document.getElementById("frontCameraBtn"),
  backCameraBtn: document.getElementById("backCameraBtn"),
  captureBtn: document.getElementById("captureBtn"),
  cameraCount: document.getElementById("cameraCount"),
  cameraName: document.getElementById("cameraName"),
  facingModeText: document.getElementById("facingModeText"),
  resolutionText: document.getElementById("resolutionText"),
  streamState: document.getElementById("streamState"),
  deviceList: document.getElementById("deviceList"),
  opacitySlider: document.getElementById("opacitySlider"),
  opacityValue: document.getElementById("opacityValue"),
  captureCanvas: document.getElementById("captureCanvas"),
  capturePreview: document.getElementById("capturePreview")
};

let mediaStream = null;
let videoDevices = [];
let frontDevice = null;
let backDevice = null;

els.referenceInput.addEventListener("change", handleReferenceImage);
els.startCameraBtn.addEventListener("click", initializeCameras);
els.frontCameraBtn.addEventListener("click", () => openDevice(frontDevice, "전면"));
els.backCameraBtn.addEventListener("click", () => openDevice(backDevice, "후면"));
els.captureBtn.addEventListener("click", capturePhoto);
els.opacitySlider.addEventListener("input", () => {
  const v = Number(els.opacitySlider.value);
  els.opacityValue.textContent = `${v}%`;
  els.overlayImage.style.opacity = String(v / 100);
});
window.addEventListener("beforeunload", stopCamera);

function handleReferenceImage(event) {
  const file = event.target.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    els.referencePreview.innerHTML = `<img src="${e.target.result}" alt="정상 기준사진">`;
    els.overlayImage.src = e.target.result;
    els.overlayImage.style.display = "block";
  };
  reader.readAsDataURL(file);
}

async function initializeCameras() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return showMessage("이 브라우저는 웹 카메라 기능을 지원하지 않습니다.", "error");
  }
  if (!window.isSecureContext) {
    return showMessage("HTTPS 주소에서 접속해 주세요.", "error");
  }

  stopCamera();
  showMessage("카메라 권한을 요청하고 있습니다.", "info");

  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true
    });

    tempStream.getTracks().forEach(t => t.stop());

    await refreshDevices();

    if (!videoDevices.length) {
      return showMessage("카메라 장치를 찾지 못했습니다.", "error");
    }

    detectFrontBackDevices();

    els.frontCameraBtn.disabled = !frontDevice;
    els.backCameraBtn.disabled = !backDevice;

    renderDeviceList();

    if (backDevice) {
      await openDevice(backDevice, "후면");
    } else if (frontDevice) {
      await openDevice(frontDevice, "전면");
    } else {
      showMessage("전면/후면 카메라를 분류하지 못했습니다.", "error");
    }

  } catch (err) {
    handleError(err);
  }
}

async function refreshDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  videoDevices = devices.filter(d => d.kind === "videoinput");
  els.cameraCount.textContent = `${videoDevices.length}개`;
}

function detectFrontBackDevices() {
  frontDevice = null;
  backDevice = null;

  for (const d of videoDevices) {
    const label = (d.label || "").toLowerCase();

    if (!frontDevice && /(front|user|facetime)/i.test(label)) {
      frontDevice = d;
    }

    if (!backDevice && /(back|rear|environment|wide|ultra|telephoto)/i.test(label)) {
      backDevice = d;
    }
  }

  // iPhone에서 label이 애매할 때는 순서 기반 보조 추정
  if (!frontDevice && videoDevices.length >= 1) {
    frontDevice = videoDevices[0];
  }

  if (!backDevice && videoDevices.length >= 2) {
    backDevice = videoDevices[videoDevices.length - 1];
  }

  // 동일 장치로 잘못 잡히는 경우 방지
  if (frontDevice && backDevice && frontDevice.deviceId === backDevice.deviceId) {
    if (videoDevices.length >= 2) {
      backDevice = videoDevices.find(d => d.deviceId !== frontDevice.deviceId) || null;
    }
  }
}

async function openDevice(device, labelText) {
  if (!device) {
    return showMessage(`${labelText} 카메라 장치를 찾지 못했습니다.`, "error");
  }

  stopCamera();

  try {
    els.cameraStatus.textContent = "연결 중";
    els.streamState.textContent = "STARTING";

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: { exact: device.deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    els.cameraVideo.srcObject = mediaStream;

    await new Promise(resolve => {
      if (els.cameraVideo.readyState >= 1) return resolve();
      els.cameraVideo.onloadedmetadata = resolve;
    });

    await els.cameraVideo.play();

    els.cameraVideo.style.display = "block";
    els.cameraPlaceholder.style.display = "none";
    els.captureBtn.disabled = false;

    const track = mediaStream.getVideoTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};

    els.cameraName.textContent = track.label || device.label || labelText;
    els.facingModeText.textContent = settings.facingMode || "-";
    els.resolutionText.textContent =
      settings.width && settings.height ? `${settings.width} × ${settings.height}` : "-";
    els.streamState.textContent = track.readyState === "live" ? "LIVE" : track.readyState;
    els.cameraStatus.textContent = `${labelText} LIVE`;

    showMessage(`${labelText} 카메라가 deviceId로 연결되었습니다.`, "success");

  } catch (err) {
    els.cameraStatus.textContent = `${labelText} 실패`;
    els.streamState.textContent = "ERROR";
    showMessage(
      `${labelText} 카메라 선택에 실패했습니다. 다른 카메라로 자동 전환하지 않습니다. (${err.name})`,
      "error"
    );
  }
}

function renderDeviceList() {
  els.deviceList.innerHTML = videoDevices.map((d, i) => {
    const role =
      frontDevice?.deviceId === d.deviceId ? "전면 추정" :
      backDevice?.deviceId === d.deviceId ? "후면 추정" : "기타";
    return `${i + 1}. ${d.label || "카메라 이름 없음"} · ${role}`;
  }).join("<br>");
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  els.cameraVideo.srcObject = null;
}

function capturePhoto() {
  if (!mediaStream || els.cameraVideo.readyState < 2) {
    return showMessage("카메라 화면이 준비되지 않았습니다.", "error");
  }

  const w = els.cameraVideo.videoWidth;
  const h = els.cameraVideo.videoHeight;

  els.captureCanvas.width = w;
  els.captureCanvas.height = h;

  const ctx = els.captureCanvas.getContext("2d");
  ctx.drawImage(els.cameraVideo, 0, 0, w, h);

  const url = els.captureCanvas.toDataURL("image/jpeg", 0.9);
  els.capturePreview.innerHTML = `<img src="${url}" alt="촬영한 차량사진">`;

  showMessage("촬영이 완료되었습니다.", "success");
}

function handleError(err) {
  console.error(err);
  let msg = `카메라 초기화 실패 (${err.name})`;
  if (err.name === "NotAllowedError") msg = "카메라 권한이 차단되어 있습니다.";
  if (err.name === "NotReadableError") msg = "다른 앱이 카메라를 사용 중이거나 카메라를 읽을 수 없습니다.";
  showMessage(msg, "error");
}

function showMessage(text, type) {
  els.cameraMessage.textContent = text;
  els.cameraMessage.className = `message ${type}`;
}
