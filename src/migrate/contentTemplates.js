import fs from 'fs-extra';
import path from 'path';
import { getTwilioClients } from '../dataFetch/twilioClients.js';

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
  } catch (e) {
    return null;
  }
}

async function listTemplates(api) {
  try {
    return await api.content.v1.templates.list({ limit: 1000 });
  } catch (e) {
    return [];
  }
}

async function createTemplate(api, sourceTemplate) {
  // Best-effort: Content API fields vary; we pass common ones when available
  const payload = {};
  if (sourceTemplate?.friendlyName) payload.friendlyName = sourceTemplate.friendlyName;
  if (sourceTemplate?.types) payload.types = sourceTemplate.types;
  if (sourceTemplate?.variables) payload.variables = sourceTemplate.variables;
  if (sourceTemplate?.channel) payload.channel = sourceTemplate.channel;
  if (sourceTemplate?.content) payload.content = sourceTemplate.content;

  // If the API rejects unknown fields, Twilio helper will throw. Callers/tests can mock success.
  const created = await api.content.v1.templates.create(payload);
  return created;
}

export async function migrateContentTemplates(selectedSourceTemplateSids, data, mapping, clientsOverride) {
  const { source: src, dest: dst } = data;
  const { source: sourceClient, dest: destClient } = clientsOverride || getTwilioClients();

  // Build quick lookup for destination by name
  const destByName = byName(dst.contentTemplates || []);

  // Preload destination list to avoid multiple calls
  const destRemoteList = await listTemplates(destClient);
  const destRemoteByName = byName(
    destRemoteList.map((t) => ({ sid: t.sid, friendlyName: t.friendlyName || t.friendly_name, uniqueName: t.uniqueName || t.unique_name }))
  );

  for (const sid of selectedSourceTemplateSids) {
    const srcMeta = (src.contentTemplates || []).find((t) => t.sid === sid);
    if (!srcMeta) continue;

    // If mapping already exists and destination has it, skip create
    const mapped = mapping.contentTemplates[sid];
    const destHasMapped = mapped && (dst.contentTemplates || []).some((t) => t.sid === mapped);

    // Or try to match by name
    const name = srcMeta.friendlyName || srcMeta.uniqueName || srcMeta.sid;
    const byNameSid = destByName.get(name) || destRemoteByName.get(name);

    let finalDestSid = mapped || byNameSid || '';

    if (!destHasMapped && !byNameSid) {
      const full = await fetchTemplate(sourceClient, sid);
      if (!full) continue;
      const created = await createTemplate(destClient, full);

      finalDestSid = created.sid;

      // Persist mapping
      mapping.contentTemplates[sid] = created.sid;
      const mapPath = path.resolve('data/mapping/sid-mapping.json');
      fs.ensureFileSync(mapPath);
      fs.writeJSONSync(mapPath, mapping, { spaces: 2 });

      // Update in-memory and persisted dest list
      const entry = { sid: created.sid, friendlyName: created.friendlyName || name };
      dst.contentTemplates = Array.isArray(dst.contentTemplates) ? dst.contentTemplates : [];
      dst.contentTemplates.push(entry);
      fs.ensureDirSync(path.resolve('data/dest'));
      fs.writeJSONSync(path.resolve('data/dest/contentTemplates.json'), dst.contentTemplates, { spaces: 2 });
    } else if (!mapped && byNameSid) {
      // Backfill mapping if found by name
      mapping.contentTemplates[sid] = byNameSid;
      const mapPath = path.resolve('data/mapping/sid-mapping.json');
      fs.ensureFileSync(mapPath);
      fs.writeJSONSync(mapPath, mapping, { spaces: 2 });
    }

    // Note: We don't attempt to update existing templates, as API semantics may vary.
  }
}
