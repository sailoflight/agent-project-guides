// Presentation metadata never enters the diagnostic JSON or signed generation.
const contextOutput = new WeakMap();
export function withContextOutput(result, options = {}) {
  contextOutput.set(result, { target: options.target, tickets: options.compactTickets, signed: Boolean(options.generationKey) });
  return result;
}

function shellArgument(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function continuationTarget(target) {
  return target ? ` --target ${shellArgument(target)}` : '';
}

export function renderContext(result) {
  const output = contextOutput.get(result) || {};
  const sources = result.selected_sources || [];
  const common = [
    `Status: ${result.status}`,
    `Authority granted: ${result.authority_granted === true}`,
    ...(result.project_id ? [`Project: ${result.project_id}`] : []),
  ];
  let lines;
  if (result.status === 'clarification_required') {
    const reasons = [...new Set((result.choices || []).map((choice) => choice.conflict_reason).filter(Boolean))];
    lines = ['APG context: choose one route', ...common,
      result.kind === 'protected'
        ? `Reason: protected signal (${(result.signals || []).join(', ')}); choose an explicit route.`
        : `Reason: ${reasons.join('; ') || result.kind}`,
    ];
    for (const choice of result.choices || []) {
      if (result.generation || output.signed) {
        if (output.tickets?.[choice.choice_id]) lines.push(`  apg context${continuationTarget(output.target)} --generation ${output.tickets[choice.choice_id]} --select ${choice.choice_id}`);
        else lines.push(`- ${choice.choice_id}`);
      } else if (choice.next_command) lines.push(`  ${choice.next_command}`);
      else lines.push(`- ${choice.choice_id}`);
    }
    if ((result.generation || output.signed) && !output.tickets) lines.push('Continuation: provide the project target through the APG CLI.');
    if (output.tickets) lines.push('Continuation: read-only; expires within 15 minutes.');
    if (result.choices_truncated) lines.push(`Choices truncated: true; omitted: ${(result.omitted_choice_ids || []).join(', ')}`);
    if (result.required_expansion?.length) lines.push(`Required expansion: ${result.required_expansion.map((item) => typeof item === 'string' ? item : `${item.plane}/${item.role}`).join(', ')}`);
  } else {
    lines = [`APG context: ${result.plane}/${result.role} (${result.mode})`, ...common];
  }
  if (result.mandatory_ids?.length) lines.push(`Mandatory: ${result.mandatory_ids.join(', ')}`);
  const content = sources.map((source) => `[${source.id}]\n${source.content.trimEnd()}`).join('\n\n');
  return `${lines.join('\n')}\n${content ? `\n${content}\n` : ''}`;
}
