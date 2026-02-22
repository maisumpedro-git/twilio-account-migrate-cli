function byName(list = []) {
  const map = new Map();
  for (const it of list) {
    const name = it.friendlyName || it.uniqueName || it.sid;
    if (!map.has(name)) map.set(name, it.sid);
  }
  return map;
}

async function fetchTemplate(api, sid) {
  try {
    return await api.content.v1.templates(sid).fetch();
  } catch {
    return null;
  }
}

async function listTemplates(api) {
  try {
    return await api.content.v1.templates.list({ limit: 1000 });
  } catch {
    return [];
  }
}

async function createTemplate(api, sourceTemplate) {
  const payload = {};
  if (sourceTemplate?.friendlyName) payload.friendlyName = sourceTemplate.friendlyName;
  if (sourceTemplate?.types) payload.types = sourceTemplate.types;
  if (sourceTemplate?.variables) payload.variables = sourceTemplate.variables;
  if (sourceTemplate?.channel) payload.channel = sourceTemplate.channel;
  if (sourceTemplate?.content) payload.content = sourceTemplate.content;

  return api.content.v1.templates.create(payload);
}

export async function migrateContentTemplates(selectedSourceTemplateSids, data, mapping, clients) {
  const { source: src, dest: dst } = data;
  const { source: sourceClient, dest: destClient } = clients;

  const destByName = byName(dst.contentTemplates || []);

  const destRemoteList = await listTemplates(destClient);
  const destRemoteByName = byName(
    destRemoteList.map((t) => ({
      sid: t.sid,
      friendlyName: t.friendlyName || t.friendly_name,
      uniqueName: t.uniqueName || t.unique_name,
    })),
  );

  for (const sid of selectedSourceTemplateSids) {
    const srcMeta = (src.contentTemplates || []).find((t) => t.sid === sid);
    if (!srcMeta) continue;

    const mapped = mapping.contentTemplates[sid];
    const destHasMapped = mapped && (dst.contentTemplates || []).some((t) => t.sid === mapped);

    const name = srcMeta.friendlyName || srcMeta.uniqueName || srcMeta.sid;
    const byNameSid = destByName.get(name) || destRemoteByName.get(name);

    if (!destHasMapped && !byNameSid) {
      const full = await fetchTemplate(sourceClient, sid);
      if (!full) continue;
      const created = await createTemplate(destClient, full);

      mapping.contentTemplates[sid] = created.sid;

      const entry = { sid: created.sid, friendlyName: created.friendlyName || name };
      dst.contentTemplates = Array.isArray(dst.contentTemplates) ? dst.contentTemplates : [];
      dst.contentTemplates.push(entry);
    } else if (!mapped && byNameSid) {
      mapping.contentTemplates[sid] = byNameSid;
    }
  }
}
