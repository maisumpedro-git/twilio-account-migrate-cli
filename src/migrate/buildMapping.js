import fs from 'fs-extra';
import path from 'path';

function byName(items, valueField = 'sid') {
  const map = new Map();
  for (const it of items || []) {
    const name = it.friendlyName || it.uniqueName;
    if (!map.has(name)) map.set(name, it[valueField]);
  }
  return map;
}

export async function buildSidMapping(source, dest) {
  const mapping = {
    taskrouter: {
      workspace: {
        [source.taskrouter?.workspace?.sid || '']: dest.taskrouter?.workspace?.sid || '',
      },
      taskQueues: {},
      workflows: {},
      activities: {},
      taskChannels: {},
    },
    serverless: {
      services: {},
      environments: {},
      functions: {},
    },
    contentTemplates: {},
    studio: {
      flows: {},
    },
  };

  // TaskRouter sub-entities
  for (const key of ['taskQueues', 'workflows', 'activities', 'taskChannels']) {
    const s = byName(source.taskrouter?.[key]);
    const d = byName(dest.taskrouter?.[key]);
    for (const [name, sid] of s) {
      const destSid = d.get(name) || '';
      mapping.taskrouter[key][sid] = destSid;
    }
  }

  // Serverless services and functions
  const sServices = byName(source.serverless);
  const dServices = byName(dest.serverless);
  for (const [name, sid] of sServices) mapping.serverless.services[sid] = dServices.get(name) || '';

  // Environments and functions per service
  for (const svc of source.serverless || []) {
    const destSvcSid = mapping.serverless.services[svc.sid] || '';
    const dSvc = (dest.serverless || []).find((x) => x.sid === destSvcSid);
    const sEnv = byName(svc.environments || []);
    const dEnv = byName(dSvc?.environments || []);
    for (const [name, sid] of sEnv) mapping.serverless.environments[sid] = dEnv.get(name) || '';

    const sDomainEnv = byName(svc.environments || [], 'domainName');
    const dDomainEnv = byName(dSvc?.environments || [], 'domainName');
    for (const [name, domainName] of sDomainEnv) mapping.serverless.environments[domainName] = dDomainEnv.get(name) || '';

    // functions per service (flatten)
    for (const env of svc.environments || []) {
      const sFuncs = byName(env.functions || []);
      const dFuncs = byName((dSvc?.environments || []).flatMap((e) => e.functions || []));
      for (const [name, sid] of sFuncs) mapping.serverless.functions[sid] = dFuncs.get(name) || '';
    }
  }

  // Content templates
  const sTpl = byName(source.contentTemplates || []);
  const dTpl = byName(dest.contentTemplates || []);
  for (const [name, sid] of sTpl) mapping.contentTemplates[sid] = dTpl.get(name) || '';

  // Studio flows
  const sFlows = byName(source.studio?.flows || []);
  const dFlows = byName(dest.studio?.flows || []);
  for (const [name, sid] of sFlows) mapping.studio.flows[sid] = dFlows.get(name) || '';

  const outPath = path.resolve('data/mapping/sid-mapping.json');
  fs.ensureFileSync(outPath);
  fs.writeJSONSync(outPath, mapping, { spaces: 2 });

  return mapping;
}
