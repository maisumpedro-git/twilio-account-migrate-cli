import fs from 'fs-extra';
import path from 'path';
import { getTwilioClients } from '../dataFetch/twilioClients.js';

function buildSidPairs(mapping) {
  const pairs = [];
  const pushPairs = (obj) => {
    for (const [from, to] of Object.entries(obj || {})) {
      if (from && to) pairs.push([from, to]);
    }
  };
  // TaskRouter
  pushPairs(mapping?.taskrouter?.workflows);
  pushPairs(mapping?.taskrouter?.taskQueues);
  pushPairs(mapping?.taskrouter?.activities);
  pushPairs(mapping?.taskrouter?.taskChannels);
  // Serverless
  pushPairs(mapping?.serverless?.services);
  pushPairs(mapping?.serverless?.environments);
  pushPairs(mapping?.serverless?.functions);
  // Content Templates (in case they appear inside flow attributes)
  pushPairs(mapping?.contentTemplates);
  // Studio flows (rare inside definitions, but keep for completeness)
  pushPairs(mapping?.studio?.flows);
  // Longest first to avoid partial overlaps
  return pairs.sort((a, b) => b[0].length - a[0].length);
}

function replaceSidsInDefinition(definition, mapping) {
  if (!definition) return definition;
  let json = JSON.stringify(definition);
  const pairs = buildSidPairs(mapping);
  for (const [from, to] of pairs) {
    json = json.replaceAll(new RegExp(from, 'g'), to);
  }
  try {
    return JSON.parse(json);
  } catch {
    // Fallback to original if parsing fails
    return definition;
  }
}

async function getFlowDefinition(api, sid) {
  const flow = await api.studio.v2.flows(sid).fetch();
  const versions = await api.studio.v2
    .flows(sid)
    .revisions.list({ limit: 1 });
  const definition = flow.definition || versions[0]?.definition;
  return { flow, definition };
}

async function createOrUpdateFlow(destClient, name, definition, commitMessage) {
  // Ensure unique_name is derived from name
  const uniqueName = name.toLowerCase().replace(/[^a-z0-9-_]/gi, '-');

  // Try to find existing flow by name
  const existing = (await destClient.studio.v2.flows.list({ limit: 1000 })).find(
    (f) => f.friendlyName === name || f.uniqueName === uniqueName
  );

  if (!existing) {
    const created = await destClient.studio.v2.flows.create({
      friendlyName: name,
      status: 'draft',
      definition,
      commitMessage: commitMessage || 'Initial import',
    });
    return created;
  }

  const updated = await destClient.studio.v2.flows(existing.sid).update({
    definition,
    status: 'published',
    commitMessage: commitMessage || 'Update by migration',
  });
  return updated;
}

export async function migrateStudioFlows(selectedSourceFlowSids, data, mapping, clientsOverride) {
  const { source: src, dest: dst } = data;
  const { source: sourceClient, dest: destClient } = clientsOverride || getTwilioClients();

  // Ensure missing flows are created first
  for (const sid of selectedSourceFlowSids) {
    const srcFlowMeta = (src.studio.flows || []).find((f) => f.sid === sid);
    if (!srcFlowMeta) continue;

    const destSid = mapping.studio.flows[sid];
    const destHas = destSid && (dst.studio.flows || []).some((f) => f.sid === destSid);

    const { flow, definition } = await getFlowDefinition(sourceClient, sid);
    const replacedDef = replaceSidsInDefinition(definition, mapping);

    if (!destHas) {
      const created = await createOrUpdateFlow(destClient, srcFlowMeta.friendlyName, replacedDef, flow.commitMessage);
      // Update mapping and saved dest data
      mapping.studio.flows[sid] = created.sid;
      const mapPath = path.resolve('data/mapping/sid-mapping.json');
      fs.writeJSONSync(mapPath, mapping, { spaces: 2 });

      dst.studio.flows.push({ sid: created.sid, friendlyName: created.friendlyName, commitMessage: created.commitMessage });
      fs.writeJSONSync(path.resolve('data/dest/studioFlows.json'), dst.studio.flows, { spaces: 2 });
    }
  }

  // Update or create the rest
  for (const sid of selectedSourceFlowSids) {
    const { flow, definition } = await getFlowDefinition(sourceClient, sid);
    const srcFlowMeta = (src.studio.flows || []).find((f) => f.sid === sid);

    const replacedDef = replaceSidsInDefinition(definition, mapping);
    await createOrUpdateFlow(destClient, srcFlowMeta.friendlyName, replacedDef, flow.commitMessage);
  }
}
