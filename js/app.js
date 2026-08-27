const referenceInput = document.getElementById("referenceInput");
const checkInput = document.getElementById("checkInput");

referenceInput.addEventListener("change", (event) => {
  previewImage(event, "referenceBox");
});

checkInput.addEventListener("change", (event) => {
  previewImage(event, "checkBox");
});

function previewImage(event, targetId) {
  const file = event.target.files?.[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("이미지 파일만 선택해 주세요.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = function (loadEvent) {
    const target = document.getElementById(targetId);
    target.innerHTML = "";

    const image = document.createElement("img");
    image.src = loadEvent.target.result;
    image.alt = targetId === "referenceBox" ? "정상 기준사진" : "현재 차량사진";

    target.appendChild(image);
  };

  reader.readAsDataURL(file);
}
