export function collectStudioFlowDefinitions(operations) {
  const list = [];
  for (const op of operations || []) {
    if (op.type !== 'studioFlows') continue;
    if (op.action !== 'create' && op.action !== 'update') continue;
    if (op.mode === 'partial') continue;
    const definition = op.data?.definition;
    if (!definition) continue;
    const name = op.data?.friendlyName || op.match?.friendlyName || 'sem-nome';
    list.push({ name, action: op.action, status: op.data?.status, definition });
  }
  return list;
}

export async function validateStudioFlowsOperations(api, operations) {
  const targets = collectStudioFlowDefinitions(operations);
  const failures = [];

  for (const t of targets) {
    try {
      const result = await api.studio.v2.flowValidate.update({
        friendlyName: t.name,
        status: t.status || 'published',
        definition: t.definition,
      });
      if (result?.valid === false) {
        const err = new Error(`Studio Flow "${t.name}" inválida`);
        err.details = result;
        failures.push({ name: t.name, action: t.action, err });
      }
    } catch (err) {
      failures.push({ name: t.name, action: t.action, err });
    }
  }

  return { ok: failures.length === 0, checked: targets.length, failures };
}
