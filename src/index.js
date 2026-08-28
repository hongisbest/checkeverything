const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/")) {
        return handleApi(request, env, url);
      }

      if (url.pathname === "/") {
        return Response.redirect(new URL("/check/", url.origin), 302);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return json({ ok: false, error: "서버 처리 중 오류가 발생했습니다." }, 500);
    }
  }
};

async function handleApi(request, env, url) {
  const path = url.pathname;

  if (path === "/api/admin/login" && request.method === "POST") {
    return adminLogin(request, env);
  }

  if (path === "/api/admin/logout" && request.method === "POST") {
    return adminLogout();
  }

  if (path === "/api/reference/active" && request.method === "GET") {
    return getActiveReference(env, url);
  }

  if (path.startsWith("/api/reference/image/") && request.method === "GET") {
    return getReferenceImage(env, path);
  }

  // 아래 API는 관리자 인증 필수
  const isAdmin = await verifyAdmin(request, env);
  if (!isAdmin) {
    return json({ ok: false, error: "관리자 인증이 필요합니다." }, 401);
  }

  if (path === "/api/admin/me" && request.method === "GET") {
    return json({ ok: true, authenticated: true });
  }

  if (path === "/api/admin/references" && request.method === "GET") {
    return listReferences(env);
  }

  if (path === "/api/admin/references" && request.method === "POST") {
    return uploadReference(request, env);
  }

  const activateMatch = path.match(/^\/api\/admin\/references\/(\d+)\/activate$/);
  if (activateMatch && request.method === "POST") {
    return activateReference(env, Number(activateMatch[1]));
  }

  const deleteMatch = path.match(/^\/api\/admin\/references\/(\d+)$/);
  if (deleteMatch && request.method === "DELETE") {
    return deleteReference(env, Number(deleteMatch[1]));
  }

  return json({ ok: false, error: "API 경로를 찾을 수 없습니다." }, 404);
}

async function adminLogin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return json({
      ok: false,
      error: "Cloudflare Secret 설정이 필요합니다."
    }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const password = String(body.password || "");

  if (!safeEqual(password, env.ADMIN_PASSWORD)) {
    return json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, 401);
  }

  const expires = Date.now() + 8 * 60 * 60 * 1000;
  const payload = `admin:${expires}`;
  const signature = await sign(payload, env.ADMIN_SESSION_SECRET);
  const token = base64UrlEncode(`${payload}:${signature}`);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": `admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
    }
  });
}

function adminLogout() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": "admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
    }
  });
}

async function verifyAdmin(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;

  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  if (!match) return false;

  try {
    const decoded = base64UrlDecode(match[1]);
    const parts = decoded.split(":");
    if (parts.length < 3) return false;

    const role = parts[0];
    const expires = Number(parts[1]);
    const signature = parts.slice(2).join(":");
    const payload = `${role}:${expires}`;

    if (role !== "admin" || !Number.isFinite(expires) || Date.now() > expires) {
      return false;
    }

    const expected = await sign(payload, env.ADMIN_SESSION_SECRET);
    return safeEqual(signature, expected);
  } catch {
    return false;
  }
}

async function listReferences(env) {
  const result = await env.DB.prepare(`
    SELECT id, title, view_type, object_key, content_type, is_active, created_at
    FROM reference_images
    ORDER BY created_at DESC, id DESC
  `).all();

  return json({ ok: true, items: result.results || [] });
}

async function uploadReference(request, env) {
  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") || "").trim();
  const viewType = String(form.get("view_type") || "driver_side").trim();

  if (!file || typeof file === "string") {
    return json({ ok: false, error: "기준사진 파일을 선택해 주세요." }, 400);
  }

  if (!title) {
    return json({ ok: false, error: "기준사진명을 입력해 주세요." }, 400);
  }

  if (!file.type.startsWith("image/")) {
    return json({ ok: false, error: "이미지 파일만 업로드할 수 있습니다." }, 400);
  }

  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    return json({ ok: false, error: "파일은 10MB 이하로 업로드해 주세요." }, 400);
  }

  const ext = extensionFromType(file.type);
  const objectKey = `references/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  await env.REFERENCE_BUCKET.put(objectKey, file.stream(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "private, max-age=0"
    }
  });

  try {
    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM reference_images"
    ).first();

    const makeActive = Number(countRow?.count || 0) === 0 ? 1 : 0;

    const inserted = await env.DB.prepare(`
      INSERT INTO reference_images
      (title, view_type, object_key, content_type, is_active)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id
    `)
      .bind(title, viewType, objectKey, file.type, makeActive)
      .first();

    return json({
      ok: true,
      id: inserted?.id,
      active: Boolean(makeActive)
    });
  } catch (error) {
    await env.REFERENCE_BUCKET.delete(objectKey);
    throw error;
  }
}

async function activateReference(env, id) {
  const target = await env.DB.prepare(
    "SELECT id FROM reference_images WHERE id = ?"
  ).bind(id).first();

  if (!target) {
    return json({ ok: false, error: "기준사진을 찾을 수 없습니다." }, 404);
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE reference_images SET is_active = 0"),
    env.DB.prepare("UPDATE reference_images SET is_active = 1 WHERE id = ?").bind(id)
  ]);

  return json({ ok: true });
}

async function deleteReference(env, id) {
  const row = await env.DB.prepare(`
    SELECT id, object_key, is_active
    FROM reference_images
    WHERE id = ?
  `).bind(id).first();

  if (!row) {
    return json({ ok: false, error: "기준사진을 찾을 수 없습니다." }, 404);
  }

  await env.REFERENCE_BUCKET.delete(row.object_key);
  await env.DB.prepare("DELETE FROM reference_images WHERE id = ?").bind(id).run();

  // 활성사진 삭제 시 남아 있는 최신 사진을 자동 활성화
  if (Number(row.is_active) === 1) {
    const next = await env.DB.prepare(`
      SELECT id FROM reference_images
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).first();

    if (next?.id) {
      await env.DB.prepare(
        "UPDATE reference_images SET is_active = 1 WHERE id = ?"
      ).bind(next.id).run();
    }
  }

  return json({ ok: true });
}

async function getActiveReference(env, url) {
  const viewType = url.searchParams.get("view_type") || "driver_side";

  let row = await env.DB.prepare(`
    SELECT id, title, view_type, object_key, content_type, created_at
    FROM reference_images
    WHERE is_active = 1 AND view_type = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).bind(viewType).first();

  // 테스트 편의를 위해 해당 촬영방향 활성사진이 없으면 전체 활성사진 fallback
  if (!row) {
    row = await env.DB.prepare(`
      SELECT id, title, view_type, object_key, content_type, created_at
      FROM reference_images
      WHERE is_active = 1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).first();
  }

  if (!row) {
    return json({ ok: true, item: null });
  }

  return json({
    ok: true,
    item: {
      id: row.id,
      title: row.title,
      view_type: row.view_type,
      created_at: row.created_at,
      image_url: `/api/reference/image/${row.id}`
    }
  });
}

async function getReferenceImage(env, path) {
  const id = Number(path.split("/").pop());
  if (!Number.isFinite(id)) {
    return new Response("Bad Request", { status: 400 });
  }

  const row = await env.DB.prepare(`
    SELECT object_key, content_type
    FROM reference_images
    WHERE id = ?
  `).bind(id).first();

  if (!row) {
    return new Response("Not Found", { status: 404 });
  }

  const object = await env.REFERENCE_BUCKET.get(row.object_key);
  if (!object) {
    return new Response("Not Found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", row.content_type || "image/jpeg");
  headers.set("cache-control", "private, max-age=300");

  return new Response(object.body, { headers });
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return false;

  let result = 0;
  for (let i = 0; i < x.length; i++) {
    result |= x.charCodeAt(i) ^ y.charCodeAt(i);
  }
  return result === 0;
}

function base64UrlEncode(text) {
  return btoa(text)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(text) {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return atob(padded);
}

function extensionFromType(type) {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("heic") || type.includes("heif")) return "heic";
  return "jpg";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
