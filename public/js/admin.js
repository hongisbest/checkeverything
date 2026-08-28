const el = {
  loginPanel: document.getElementById("loginPanel"),
  adminPanel: document.getElementById("adminPanel"),
  password: document.getElementById("password"),
  loginBtn: document.getElementById("loginBtn"),
  loginMessage: document.getElementById("loginMessage"),
  logoutBtn: document.getElementById("logoutBtn"),
  title: document.getElementById("title"),
  viewType: document.getElementById("viewType"),
  file: document.getElementById("file"),
  uploadBtn: document.getElementById("uploadBtn"),
  uploadMessage: document.getElementById("uploadMessage"),
  refreshBtn: document.getElementById("refreshBtn"),
  referenceList: document.getElementById("referenceList")
};

el.loginBtn.addEventListener("click", login);
el.password.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
el.logoutBtn.addEventListener("click", logout);
el.uploadBtn.addEventListener("click", uploadReference);
el.refreshBtn.addEventListener("click", loadReferences);

checkSession();

async function checkSession() {
  const res = await fetch("/api/admin/me", { credentials: "same-origin" });
  if (res.ok) {
    showAdmin();
  } else {
    showLogin();
  }
}

async function login() {
  const password = el.password.value;

  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ password })
  });

  const data = await res.json();

  if (!res.ok) {
    setMessage(el.loginMessage, data.error || "로그인 실패", "error");
    return;
  }

  el.password.value = "";
  showAdmin();
}

async function logout() {
  await fetch("/api/admin/logout", {
    method: "POST",
    credentials: "same-origin"
  });
  showLogin();
}

function showLogin() {
  el.loginPanel.hidden = false;
  el.adminPanel.hidden = true;
}

function showAdmin() {
  el.loginPanel.hidden = true;
  el.adminPanel.hidden = false;
  loadReferences();
}

async function uploadReference() {
  if (!el.title.value.trim()) {
    return setMessage(el.uploadMessage, "기준사진명을 입력해 주세요.", "error");
  }

  if (!el.file.files[0]) {
    return setMessage(el.uploadMessage, "사진을 선택해 주세요.", "error");
  }

  const form = new FormData();
  form.append("title", el.title.value.trim());
  form.append("view_type", el.viewType.value);
  form.append("file", el.file.files[0]);

  el.uploadBtn.disabled = true;
  setMessage(el.uploadMessage, "업로드 중입니다.", "info");

  try {
    const res = await fetch("/api/admin/references", {
      method: "POST",
      credentials: "same-origin",
      body: form
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(el.uploadMessage, data.error || "업로드 실패", "error");
      return;
    }

    el.title.value = "";
    el.file.value = "";
    setMessage(
      el.uploadMessage,
      data.active ? "등록 완료. 첫 사진이라 자동으로 활성화되었습니다." : "기준사진이 등록되었습니다.",
      "success"
    );
    await loadReferences();
  } finally {
    el.uploadBtn.disabled = false;
  }
}

async function loadReferences() {
  const res = await fetch("/api/admin/references", {
    credentials: "same-origin",
    cache: "no-store"
  });

  if (res.status === 401) {
    return showLogin();
  }

  const data = await res.json();
  const items = data.items || [];

  if (!items.length) {
    el.referenceList.innerHTML = `<div class="placeholder"><strong>등록된 기준사진이 없습니다.</strong></div>`;
    return;
  }

  el.referenceList.innerHTML = items.map(item => `
    <div class="reference-item">
      <div class="reference-thumb">
        <img src="/api/reference/image/${item.id}" alt="${escapeHtml(item.title)}">
      </div>
      <div class="reference-meta">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${viewName(item.view_type)}</span>
        <span>${escapeHtml(item.created_at)}</span>
        ${Number(item.is_active) === 1 ? `<span class="active-tag">현재 활성사진</span>` : ""}
      </div>
      <div class="item-actions">
        <button class="btn small" onclick="activateReference(${item.id})" ${Number(item.is_active) === 1 ? "disabled" : ""}>활성화</button>
        <button class="btn small danger" onclick="deleteReference(${item.id})">삭제</button>
      </div>
    </div>
  `).join("");
}

window.activateReference = async function(id) {
  const res = await fetch(`/api/admin/references/${id}/activate`, {
    method: "POST",
    credentials: "same-origin"
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "활성화 실패");
    return;
  }
  loadReferences();
};

window.deleteReference = async function(id) {
  if (!confirm("이 기준사진을 삭제할까요?")) return;

  const res = await fetch(`/api/admin/references/${id}`, {
    method: "DELETE",
    credentials: "same-origin"
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "삭제 실패");
    return;
  }
  loadReferences();
};

function setMessage(target, text, type) {
  target.textContent = text;
  target.className = `message ${type}`;
}

function viewName(type) {
  return {
    driver_side: "운전석 측면",
    passenger_side: "조수석 측면",
    rear: "후면",
    front: "전면"
  }[type] || type;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}
