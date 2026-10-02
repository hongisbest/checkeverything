const encoder = new TextEncoder();
let schemaPromise = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) {
        await ensureSchema(env);
        return await handleApi(request, env, url);
      }
      if (url.pathname === "/") {
        return Response.redirect(new URL("/check/", url.origin), 302);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("UNHANDLED", error);
      return json({ ok:false, error:"서버 처리 중 오류가 발생했습니다." }, 500);
    }
  }
};

function ensureSchema(env) {
  if (!schemaPromise) {
    schemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS vc2_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        view_type TEXT NOT NULL,
        guide_text TEXT NOT NULL DEFAULT '',
        object_key TEXT NOT NULL UNIQUE,
        content_type TEXT NOT NULL DEFAULT 'image/jpeg',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS vc2_regions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference_id INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT '홍보 스티커',
        x REAL NOT NULL, y REAL NOT NULL, width REAL NOT NULL, height REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS vc2_inspections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_name TEXT NOT NULL,
        employee_id TEXT NOT NULL DEFAULT '',
        department TEXT NOT NULL DEFAULT '',
        vehicle_no TEXT NOT NULL,
        reference_id INTEGER NOT NULL,
        view_type TEXT NOT NULL,
        photo_object_key TEXT NOT NULL,
        score REAL NOT NULL,
        status TEXT NOT NULL,
        findings_json TEXT NOT NULL DEFAULT '[]',
        metrics_json TEXT NOT NULL DEFAULT '{}',
        admin_state TEXT NOT NULL DEFAULT '미확인',
        admin_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_vc2_refs_active ON vc2_references(view_type, is_active)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_vc2_regions_ref ON vc2_regions(reference_id)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_vc2_insp_status ON vc2_inspections(status, admin_state)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS vc2_rules (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        damage_normal_max REAL NOT NULL DEFAULT 10,
        damage_replace_min REAL NOT NULL DEFAULT 30,
        position_tolerance REAL NOT NULL DEFAULT 10,
        color_difference_max REAL NOT NULL DEFAULT 35,
        shape_similarity_min REAL NOT NULL DEFAULT 75,
        use_damage INTEGER NOT NULL DEFAULT 1,
        use_position INTEGER NOT NULL DEFAULT 1,
        use_color INTEGER NOT NULL DEFAULT 1,
        use_shape INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      env.DB.prepare(`INSERT OR IGNORE INTO vc2_rules (
        id, damage_normal_max, damage_replace_min, position_tolerance,
        color_difference_max, shape_similarity_min,
        use_damage, use_position, use_color, use_shape
      ) VALUES (1,10,30,10,35,75,1,1,1,1)`)
    ]).catch(e => { schemaPromise = null; throw e; });
  }
  return schemaPromise;
}

async function handleApi(request, env, url) {
  const p = url.pathname;

  if (p === "/api/config" && request.method === "GET") return getConfig(env);
  if (p === "/api/inspection" && request.method === "POST") return saveInspection(request, env);

  const refImg = p.match(/^\/api\/reference\/(\d+)\/image$/);
  if (refImg && request.method === "GET") return getReferenceImage(env, Number(refImg[1]));

  if (p === "/api/admin/login" && request.method === "POST") return adminLogin(request, env);
  if (p === "/api/admin/logout" && request.method === "POST") return adminLogout();

  if (!(await verifyAdmin(request, env))) {
    return json({ ok:false, error:"관리자 인증이 필요합니다." }, 401);
  }

  if (p === "/api/admin/me" && request.method === "GET") return json({ok:true});
  if (p === "/api/admin/references" && request.method === "GET") return listReferences(env);
  if (p === "/api/admin/references" && request.method === "POST") return uploadReference(request, env);
  if (p === "/api/admin/rules" && request.method === "GET") return getRules(env);
  if (p === "/api/admin/rules" && request.method === "POST") return saveRules(request, env);
  if (p === "/api/admin/inspections" && request.method === "GET") return listInspections(env, url);
  if (p === "/api/admin/export.csv" && request.method === "GET") return exportCsv(env);

  const activate = p.match(/^\/api\/admin\/references\/(\d+)\/activate$/);
  if (activate && request.method === "POST") return activateReference(env, Number(activate[1]));

  const referenceEdit = p.match(/^\/api\/admin\/references\/(\d+)$/);
  if (referenceEdit && request.method === "PATCH") return updateReference(request, env, Number(referenceEdit[1]));

  const referenceDelete = p.match(/^\/api\/admin\/references\/(\d+)$/);
  if (referenceDelete && request.method === "DELETE") return deleteReference(env, Number(referenceDelete[1]));

  const regions = p.match(/^\/api\/admin\/references\/(\d+)\/regions$/);
  if (regions && request.method === "GET") return listRegions(env, Number(regions[1]));
  if (regions && request.method === "POST") return addRegion(request, env, Number(regions[1]));

  const regionDelete = p.match(/^\/api\/admin\/regions\/(\d+)$/);
  if (regionDelete && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM vc2_regions WHERE id=?").bind(Number(regionDelete[1])).run();
    return json({ok:true});
  }

  const inspectionImage = p.match(/^\/api\/admin\/inspections\/(\d+)\/image$/);
  if (inspectionImage && request.method === "GET") return getInspectionImage(env, Number(inspectionImage[1]));

  const inspectionPatch = p.match(/^\/api\/admin\/inspections\/(\d+)$/);
  if (inspectionPatch && request.method === "PATCH") return updateInspection(request, env, Number(inspectionPatch[1]));

  return json({ok:false,error:"API 경로를 찾을 수 없습니다."},404);
}

async function adminLogin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return json({ok:false,error:"Cloudflare Secret 설정이 필요합니다."},500);
  }
  const body = await request.json().catch(()=>({}));
  const password = String(body.password || "");
  if (!safeEqual(password, String(env.ADMIN_PASSWORD))) {
    return json({ok:false,error:"비밀번호가 올바르지 않습니다."},401);
  }

  const expires = Date.now() + 8*60*60*1000;
  const payload = `admin:${expires}`;
  const signature = await sign(payload, env.ADMIN_SESSION_SECRET);
  const token = base64url(`${payload}:${signature}`);

  return new Response(JSON.stringify({ok:true}), {
    headers:{
      "content-type":"application/json; charset=utf-8",
      "set-cookie":`vc2_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
    }
  });
}

function adminLogout() {
  return new Response(JSON.stringify({ok:true}), {
    headers:{
      "content-type":"application/json; charset=utf-8",
      "set-cookie":"vc2_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
    }
  });
}

async function verifyAdmin(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)vc2_admin=([^;]+)/);
  if (!m) return false;
  try {
    const parts = unbase64url(m[1]).split(":");
    if (parts.length < 3) return false;
    const role = parts[0], expires = Number(parts[1]), sig = parts.slice(2).join(":");
    if (role !== "admin" || !Number.isFinite(expires) || Date.now() > expires) return false;
    const expected = await sign(`${role}:${expires}`, env.ADMIN_SESSION_SECRET);
    return safeEqual(sig, expected);
  } catch { return false; }
}

async function getConfig(env) {
  const rows = await env.DB.prepare(`
    SELECT id,title,view_type,guide_text,created_at
    FROM vc2_references WHERE is_active=1
    ORDER BY CASE view_type
      WHEN 'driver_side' THEN 1
      WHEN 'passenger_side' THEN 2
      WHEN 'rear' THEN 3
      WHEN 'front' THEN 4 ELSE 9 END, id DESC
  `).all();

  const refs = [];
  for (const r of rows.results || []) {
    const regs = await env.DB.prepare(`
      SELECT id,label,x,y,width,height FROM vc2_regions
      WHERE reference_id=? ORDER BY id
    `).bind(r.id).all();
    refs.push({...r, image_url:`/api/reference/${r.id}/image`, regions:regs.results || []});
  }
  const rules = await readRules(env);
  return json({ok:true,references:refs,rules});
}

async function readRules(env) {
  const row = await env.DB.prepare(`
    SELECT damage_normal_max,damage_replace_min,position_tolerance,
           color_difference_max,shape_similarity_min,
           use_damage,use_position,use_color,use_shape,updated_at
    FROM vc2_rules WHERE id=1
  `).first();

  return row || {
    damage_normal_max:10,
    damage_replace_min:30,
    position_tolerance:10,
    color_difference_max:35,
    shape_similarity_min:75,
    use_damage:1,use_position:1,use_color:1,use_shape:1
  };
}

async function getRules(env) {
  return json({ok:true,rules:await readRules(env)});
}

async function saveRules(request, env) {
  const body = await request.json().catch(()=>({}));

  const damageNormal = Number(body.damage_normal_max);
  const damageReplace = Number(body.damage_replace_min);
  const positionTolerance = Number(body.position_tolerance);
  const colorMax = Number(body.color_difference_max);
  const shapeMin = Number(body.shape_similarity_min);

  if (![damageNormal,damageReplace,positionTolerance,colorMax,shapeMin].every(Number.isFinite)) {
    return json({ok:false,error:"판정기준 값이 올바르지 않습니다."},400);
  }
  if (damageNormal < 0 || damageNormal > 100 ||
      damageReplace < 0 || damageReplace > 100 ||
      positionTolerance < 0 || positionTolerance > 100 ||
      colorMax < 0 || colorMax > 255 ||
      shapeMin < 0 || shapeMin > 100) {
    return json({ok:false,error:"판정기준 값의 허용범위를 확인해 주세요."},400);
  }
  if (damageReplace <= damageNormal) {
    return json({ok:false,error:"교체권고 손상률은 정상 허용 손상률보다 커야 합니다."},400);
  }

  await env.DB.prepare(`
    INSERT INTO vc2_rules (
      id,damage_normal_max,damage_replace_min,position_tolerance,
      color_difference_max,shape_similarity_min,
      use_damage,use_position,use_color,use_shape,updated_at
    ) VALUES (1,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      damage_normal_max=excluded.damage_normal_max,
      damage_replace_min=excluded.damage_replace_min,
      position_tolerance=excluded.position_tolerance,
      color_difference_max=excluded.color_difference_max,
      shape_similarity_min=excluded.shape_similarity_min,
      use_damage=excluded.use_damage,
      use_position=excluded.use_position,
      use_color=excluded.use_color,
      use_shape=excluded.use_shape,
      updated_at=datetime('now')
  `).bind(
    damageNormal,damageReplace,positionTolerance,colorMax,shapeMin,
    body.use_damage ? 1 : 0,
    body.use_position ? 1 : 0,
    body.use_color ? 1 : 0,
    body.use_shape ? 1 : 0
  ).run();

  return json({ok:true,rules:await readRules(env)});
}

async function uploadReference(request, env) {
  const form = await request.formData();
  const file = form.get("file");
  const title = text(form.get("title"), 100);
  const viewType = text(form.get("view_type"), 40);
  const guideText = text(form.get("guide_text"), 1000);

  if (!file || typeof file === "string") return json({ok:false,error:"기준사진을 선택해 주세요."},400);
  if (!title) return json({ok:false,error:"기준사진명을 입력해 주세요."},400);
  if (!["driver_side","passenger_side","rear","front"].includes(viewType)) return json({ok:false,error:"촬영방향이 올바르지 않습니다."},400);
  if (!file.type.startsWith("image/")) return json({ok:false,error:"이미지 파일만 등록할 수 있습니다."},400);
  if (file.size > 8*1024*1024) return json({ok:false,error:"이미지는 8MB 이하로 등록해 주세요."},400);

  const key = `app-v2/reference/${Date.now()}-${crypto.randomUUID()}.${extension(file.type)}`;
  await env.STORAGE.put(key, file.stream(), {httpMetadata:{contentType:file.type,cacheControl:"private,max-age=0"}});

  try {
    await env.DB.prepare("UPDATE vc2_references SET is_active=0 WHERE view_type=?").bind(viewType).run();
    const inserted = await env.DB.prepare(`
      INSERT INTO vc2_references(title,view_type,guide_text,object_key,content_type,is_active)
      VALUES(?,?,?,?,?,1) RETURNING id
    `).bind(title,viewType,guideText,key,file.type).first();

    return json({ok:true,id:inserted?.id});
  } catch (e) {
    await env.STORAGE.delete(key);
    throw e;
  }
}


async function updateReference(request, env, id) {
  const current = await env.DB.prepare(`
    SELECT id,title,view_type,guide_text,object_key,content_type,is_active
    FROM vc2_references WHERE id=?
  `).bind(id).first();

  if (!current) return json({ok:false,error:"기준사진을 찾을 수 없습니다."},404);

  const form = await request.formData();
  const title = text(form.get("title"),100);
  const viewType = text(form.get("view_type"),40);
  const guideText = text(form.get("guide_text"),1000);
  const file = form.get("file");

  if (!title) return json({ok:false,error:"기준사진명을 입력해 주세요."},400);
  if (!["driver_side","passenger_side","rear","front"].includes(viewType)) {
    return json({ok:false,error:"촬영방향이 올바르지 않습니다."},400);
  }

  const hasNewFile = file && typeof file !== "string" && Number(file.size||0) > 0;
  if (hasNewFile) {
    if (!file.type.startsWith("image/")) return json({ok:false,error:"이미지 파일만 등록할 수 있습니다."},400);
    if (file.size > 8*1024*1024) return json({ok:false,error:"이미지는 8MB 이하로 등록해 주세요."},400);
  }

  const used = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM vc2_inspections WHERE reference_id=?"
  ).bind(id).first();
  const usageCount = Number(used?.c || 0);

  // 사진 교체 + 과거 점검이 연결된 경우:
  // 기존 기준사진을 수정하지 않고 신규 버전을 생성해 과거 판정 근거를 보존한다.
  if (hasNewFile && usageCount > 0) {
    const newKey = `app-v2/reference/${Date.now()}-${crypto.randomUUID()}.${extension(file.type)}`;
    await env.STORAGE.put(newKey,file.stream(),{
      httpMetadata:{contentType:file.type,cacheControl:"private,max-age=0"}
    });

    try {
      if (Number(current.is_active) === 1) {
        await env.DB.prepare("UPDATE vc2_references SET is_active=0 WHERE view_type=?")
          .bind(viewType).run();
      }

      const inserted = await env.DB.prepare(`
        INSERT INTO vc2_references(
          title,view_type,guide_text,object_key,content_type,is_active
        ) VALUES(?,?,?,?,?,?) RETURNING id
      `).bind(
        title,viewType,guideText,newKey,file.type,Number(current.is_active)===1?1:0
      ).first();

      // 비율 좌표이므로 기존 검증영역을 신규 버전에 복사한다.
      await env.DB.prepare(`
        INSERT INTO vc2_regions(reference_id,label,x,y,width,height)
        SELECT ?,label,x,y,width,height
        FROM vc2_regions WHERE reference_id=?
      `).bind(inserted.id,id).run();

      return json({
        ok:true,
        id:inserted.id,
        versioned:true,
        message:"기존 점검이 연결되어 있어 과거 기준사진은 보존하고 새 버전으로 등록했습니다."
      });
    } catch (e) {
      await env.STORAGE.delete(newKey);
      throw e;
    }
  }

  // 사진이 없는 메타데이터 수정 또는 미사용 기준사진의 사진 교체
  let newKey = current.object_key;
  let newType = current.content_type;
  let oldKeyToDelete = null;

  if (hasNewFile) {
    newKey = `app-v2/reference/${Date.now()}-${crypto.randomUUID()}.${extension(file.type)}`;
    newType = file.type;
    await env.STORAGE.put(newKey,file.stream(),{
      httpMetadata:{contentType:file.type,cacheControl:"private,max-age=0"}
    });
    oldKeyToDelete = current.object_key;
  }

  try {
    // 활성 사진의 촬영방향이 바뀌는 경우 새 방향의 다른 활성값을 해제한다.
    if (Number(current.is_active) === 1 && viewType !== current.view_type) {
      await env.DB.prepare(
        "UPDATE vc2_references SET is_active=0 WHERE view_type=? AND id<>?"
      ).bind(viewType,id).run();
    }

    await env.DB.prepare(`
      UPDATE vc2_references
      SET title=?,view_type=?,guide_text=?,object_key=?,content_type=?
      WHERE id=?
    `).bind(title,viewType,guideText,newKey,newType,id).run();

    if (oldKeyToDelete && oldKeyToDelete !== newKey) {
      await env.STORAGE.delete(oldKeyToDelete);
    }

    return json({
      ok:true,
      id,
      versioned:false,
      message:hasNewFile ? "기준사진과 설정을 수정했습니다." : "기준사진 설정을 수정했습니다."
    });
  } catch (e) {
    if (hasNewFile && newKey !== current.object_key) {
      await env.STORAGE.delete(newKey);
    }
    throw e;
  }
}

async function listReferences(env) {
  const r = await env.DB.prepare(`
    SELECT a.id,a.title,a.view_type,a.guide_text,a.is_active,a.created_at,COUNT(b.id) region_count
    FROM vc2_references a
    LEFT JOIN vc2_regions b ON b.reference_id=a.id
    GROUP BY a.id ORDER BY a.id DESC
  `).all();
  return json({ok:true,items:r.results || []});
}

async function activateReference(env,id) {
  const row = await env.DB.prepare("SELECT id,view_type FROM vc2_references WHERE id=?").bind(id).first();
  if (!row) return json({ok:false,error:"기준사진을 찾을 수 없습니다."},404);
  await env.DB.batch([
    env.DB.prepare("UPDATE vc2_references SET is_active=0 WHERE view_type=?").bind(row.view_type),
    env.DB.prepare("UPDATE vc2_references SET is_active=1 WHERE id=?").bind(id)
  ]);
  return json({ok:true});
}

async function deleteReference(env,id) {
  const row = await env.DB.prepare("SELECT object_key FROM vc2_references WHERE id=?").bind(id).first();
  if (!row) return json({ok:false,error:"기준사진을 찾을 수 없습니다."},404);

  const used = await env.DB.prepare("SELECT COUNT(*) AS c FROM vc2_inspections WHERE reference_id=?").bind(id).first();
  if (Number(used?.c || 0) > 0) {
    return json({ok:false,error:"점검결과와 연결된 기준사진은 데이터 보존을 위해 삭제할 수 없습니다."},409);
  }

  await env.STORAGE.delete(row.object_key);
  await env.DB.prepare("DELETE FROM vc2_regions WHERE reference_id=?").bind(id).run();
  await env.DB.prepare("DELETE FROM vc2_references WHERE id=?").bind(id).run();
  return json({ok:true});
}

async function listRegions(env,id) {
  const r = await env.DB.prepare("SELECT id,label,x,y,width,height FROM vc2_regions WHERE reference_id=? ORDER BY id")
    .bind(id).all();
  return json({ok:true,items:r.results || []});
}

async function addRegion(request,env,id) {
  const body = await request.json().catch(()=>({}));
  const x=Number(body.x), y=Number(body.y), width=Number(body.width), height=Number(body.height);
  if (![x,y,width,height].every(Number.isFinite) ||
      x<0 || y<0 || width<.01 || height<.01 || x+width>1.0001 || y+height>1.0001) {
    return json({ok:false,error:"검증영역 좌표가 올바르지 않습니다."},400);
  }
  const ref = await env.DB.prepare("SELECT id FROM vc2_references WHERE id=?").bind(id).first();
  if (!ref) return json({ok:false,error:"기준사진을 찾을 수 없습니다."},404);

  await env.DB.prepare(`
    INSERT INTO vc2_regions(reference_id,label,x,y,width,height)
    VALUES(?,?,?,?,?,?)
  `).bind(id,text(body.label,80) || "홍보 스티커",x,y,width,height).run();

  return json({ok:true});
}

async function getReferenceImage(env,id) {
  const row = await env.DB.prepare("SELECT object_key,content_type FROM vc2_references WHERE id=?").bind(id).first();
  if (!row) return new Response("Not Found",{status:404});
  const object = await env.STORAGE.get(row.object_key);
  if (!object) return new Response("Not Found",{status:404});
  const h = new Headers();
  object.writeHttpMetadata(h);
  h.set("content-type",row.content_type || "image/jpeg");
  h.set("cache-control","private,max-age=180");
  return new Response(object.body,{headers:h});
}

async function saveInspection(request,env) {
  const form = await request.formData();
  const file = form.get("file");
  let meta;
  try { meta = JSON.parse(String(form.get("meta") || "")); }
  catch { return json({ok:false,error:"점검 데이터 형식이 올바르지 않습니다."},400); }

  if (!file || typeof file === "string") return json({ok:false,error:"촬영사진이 없습니다."},400);
  if (file.size > 8*1024*1024) return json({ok:false,error:"촬영사진은 8MB 이하로 제출해 주세요."},400);

  const referenceId = Number(meta.reference_id);
  const ref = await env.DB.prepare("SELECT view_type FROM vc2_references WHERE id=?").bind(referenceId).first();
  if (!ref) return json({ok:false,error:"기준사진을 찾을 수 없습니다."},400);

  const employeeName = text(meta.employee_name,60), vehicleNo = text(meta.vehicle_no,40);
  if (!employeeName || !vehicleNo) return json({ok:false,error:"성명과 차량번호를 입력해 주세요."},400);

  const key = `app-v2/inspection/${Date.now()}-${crypto.randomUUID()}.jpg`;
  await env.STORAGE.put(key,file.stream(),{httpMetadata:{contentType:file.type || "image/jpeg"}});

  try {
    const inserted = await env.DB.prepare(`
      INSERT INTO vc2_inspections(
        employee_name,employee_id,department,vehicle_no,reference_id,view_type,
        photo_object_key,score,status,findings_json,metrics_json
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id
    `).bind(
      employeeName,text(meta.employee_id,40),text(meta.department,80),vehicleNo,
      referenceId,ref.view_type,key,
      Math.max(0,Math.min(100,Number(meta.score)||0)),
      meta.status==="정상" ? "정상" : "확인필요",
      JSON.stringify(Array.isArray(meta.findings) ? meta.findings.slice(0,30) : []),
      JSON.stringify(meta.metrics && typeof meta.metrics==="object" ? meta.metrics : {})
    ).first();
    return json({ok:true,id:inserted?.id});
  } catch(e) {
    await env.STORAGE.delete(key);
    throw e;
  }
}

async function listInspections(env,url) {
  const q = text(url.searchParams.get("q"),100);
  const status = text(url.searchParams.get("status"),20);
  const adminState = text(url.searchParams.get("admin_state"),20);
  const where=[], bind=[];

  if (status) { where.push("i.status=?"); bind.push(status); }
  if (adminState) { where.push("i.admin_state=?"); bind.push(adminState); }
  if (q) {
    where.push("(i.employee_name LIKE ? OR i.vehicle_no LIKE ? OR i.department LIKE ?)");
    const s = `%${q}%`; bind.push(s,s,s);
  }

  const sql = `
    SELECT i.id,i.employee_name,i.employee_id,i.department,i.vehicle_no,i.reference_id,
           i.view_type,i.score,i.status,i.findings_json,i.admin_state,i.admin_note,i.created_at,
           r.title reference_title
    FROM vc2_inspections i
    LEFT JOIN vc2_references r ON r.id=i.reference_id
    ${where.length ? "WHERE "+where.join(" AND ") : ""}
    ORDER BY i.id DESC LIMIT 500
  `;
  const r = await env.DB.prepare(sql).bind(...bind).all();
  return json({ok:true,items:r.results || []});
}

async function getInspectionImage(env,id) {
  const row = await env.DB.prepare("SELECT photo_object_key FROM vc2_inspections WHERE id=?").bind(id).first();
  if (!row) return new Response("Not Found",{status:404});
  const object = await env.STORAGE.get(row.photo_object_key);
  if (!object) return new Response("Not Found",{status:404});
  const h = new Headers();
  object.writeHttpMetadata(h);
  h.set("cache-control","private,max-age=60");
  return new Response(object.body,{headers:h});
}

async function updateInspection(request,env,id) {
  const body = await request.json().catch(()=>({}));
  const allowed = ["미확인","확인완료","개선요청","조치완료"];
  const state = allowed.includes(body.admin_state) ? body.admin_state : "미확인";
  await env.DB.prepare("UPDATE vc2_inspections SET admin_state=?,admin_note=? WHERE id=?")
    .bind(state,text(body.admin_note,500),id).run();
  return json({ok:true});
}

async function exportCsv(env) {
  const r = await env.DB.prepare(`
    SELECT i.id,i.created_at,i.employee_name,i.employee_id,i.department,i.vehicle_no,
           i.view_type,r.title reference_title,i.score,i.status,i.findings_json,
           i.admin_state,i.admin_note
    FROM vc2_inspections i
    LEFT JOIN vc2_references r ON r.id=i.reference_id
    ORDER BY i.id DESC
  `).all();

  const rows = [["ID","점검일시","성명","사번","부서","차량번호","촬영방향","기준사진","점수","자동판정","검증항목","관리상태","관리자메모"]];
  for (const x of r.results || []) {
    let findings=[]; try { findings=JSON.parse(x.findings_json || "[]"); } catch {}
    rows.push([x.id,x.created_at,x.employee_name,x.employee_id,x.department,x.vehicle_no,
      viewLabel(x.view_type),x.reference_title || "",Number(x.score).toFixed(1),x.status,
      findings.join(" / "),x.admin_state,x.admin_note]);
  }
  const body = "\uFEFF"+rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  return new Response(body,{headers:{
    "content-type":"text/csv; charset=utf-8",
    "content-disposition":'attachment; filename="vehicle-sticker-inspections.csv"'
  }});
}

function viewLabel(v){return({driver_side:"운전석 측면",passenger_side:"조수석 측면",rear:"후면",front:"전면"})[v]||v}
function text(v,n){return String(v??"").trim().slice(0,n)}
function extension(type){if(type.includes("png"))return"png";if(type.includes("webp"))return"webp";return"jpg"}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
function safeEqual(a,b){const x=String(a),y=String(b);if(x.length!==y.length)return false;let d=0;for(let i=0;i<x.length;i++)d|=x.charCodeAt(i)^y.charCodeAt(i);return d===0}
async function sign(payload,secret){const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,encoder.encode(payload));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("")}
function base64url(t){return btoa(t).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function unbase64url(t){const n=t.replace(/-/g,"+").replace(/_/g,"/");return atob(n+"=".repeat((4-n.length%4)%4))}
