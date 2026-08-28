
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    if (url.pathname === "/") {
      return Response.redirect(new URL("/check/", url.origin), 302);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleApi(request, env, url) {
  const path = url.pathname;

  if (path === "/api/admin/login" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (String(body.password || "") !== String(env.ADMIN_PASSWORD || "")) {
      return json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, 401);
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": "admin_session=ok; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800"
      }
    });
  }

  if (path === "/api/admin/logout" && request.method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": "admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
      }
    });
  }

  if (path === "/api/reference/active" && request.method === "GET") {
    const row = await env.DB.prepare(`
      SELECT id, title, view_type, created_at
      FROM reference_images
      WHERE is_active = 1
      ORDER BY id DESC
      LIMIT 1
    `).first();

    if (!row) return json({ ok: true, item: null });

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

  if (path.startsWith("/api/reference/image/") && request.method === "GET") {
    const id = Number(path.split("/").pop());
    const row = await env.DB.prepare(
      "SELECT object_key, content_type FROM reference_images WHERE id = ?"
    ).bind(id).first();

    if (!row) return new Response("Not Found", { status: 404 });

    const object = await env.REFERENCE_BUCKET.get(row.object_key);
    if (!object) return new Response("Not Found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", row.content_type || "image/jpeg");
    return new Response(object.body, { headers });
  }

  const publicRegionsMatch = path.match(/^\/api\/reference\/(\d+)\/regions$/);
  if (publicRegionsMatch && request.method === "GET") {
    const referenceId = Number(publicRegionsMatch[1]);
    const result = await env.DB.prepare(`
      SELECT id, label, x, y, width, height
      FROM inspection_regions
      WHERE reference_image_id = ?
      ORDER BY id
    `).bind(referenceId).all();

    return json({ ok: true, items: result.results || [] });
  }

  if (!isAdmin(request)) {
    return json({ ok: false, error: "관리자 인증이 필요합니다." }, 401);
  }

  if (path === "/api/admin/me" && request.method === "GET") {
    return json({ ok: true });
  }

  if (path === "/api/admin/references" && request.method === "GET") {
    const result = await env.DB.prepare(`
      SELECT r.id, r.title, r.view_type, r.is_active, r.created_at,
             COUNT(ir.id) AS region_count
      FROM reference_images r
      LEFT JOIN inspection_regions ir ON ir.reference_image_id = r.id
      GROUP BY r.id
      ORDER BY r.id DESC
    `).all();

    return json({ ok: true, items: result.results || [] });
  }

  const regionsMatch = path.match(/^\/api\/admin\/references\/(\d+)\/regions$/);

  if (regionsMatch && request.method === "GET") {
    const referenceId = Number(regionsMatch[1]);
    const result = await env.DB.prepare(`
      SELECT id, label, x, y, width, height
      FROM inspection_regions
      WHERE reference_image_id = ?
      ORDER BY id
    `).bind(referenceId).all();

    return json({ ok: true, items: result.results || [] });
  }

  if (regionsMatch && request.method === "POST") {
    const referenceId = Number(regionsMatch[1]);
    const body = await request.json().catch(() => ({}));

    const label = String(body.label || "스티커 영역");
    const x = Number(body.x);
    const y = Number(body.y);
    const width = Number(body.width);
    const height = Number(body.height);

    if (![x,y,width,height].every(Number.isFinite)) {
      return json({ ok: false, error: "좌표가 올바르지 않습니다." }, 400);
    }

    await env.DB.prepare(`
      INSERT INTO inspection_regions
      (reference_image_id, label, x, y, width, height)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(referenceId, label, x, y, width, height).run();

    return json({ ok: true });
  }

  const regionDeleteMatch = path.match(/^\/api\/admin\/regions\/(\d+)$/);
  if (regionDeleteMatch && request.method === "DELETE") {
    await env.DB.prepare(
      "DELETE FROM inspection_regions WHERE id = ?"
    ).bind(Number(regionDeleteMatch[1])).run();

    return json({ ok: true });
  }

  return json({ ok: false, error: "Not Found" }, 404);
}

function isAdmin(request) {
  const cookie = request.headers.get("cookie") || "";
  return cookie.includes("admin_session=ok");
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
