// Only the AI-facing context projection omits transport diagnostics.
// Explicit JSON and other commands retain their diagnostic error contract.
export function contextErrorRecord(error, argv = process.argv.slice(2)) {
  const formatIndex = argv.lastIndexOf('--format');
  const compact = argv[0] === 'context' && (formatIndex < 0 || argv[formatIndex + 1] === 'context');
  const code = error.code || 'internal_error';
  if (!compact) return {
    error: code,
    message: error.code ? error.message : (error.stack || error.message),
    ...(error.details ? { details: error.details } : {}),
  };
  const message = String(error.message || 'Context request failed')
    .replace(/\b[A-Za-z0-9_-]{80,}\.[a-f0-9]{64}\b/gi, '<generation>')
    .replace(/\bsha256[:-][a-f0-9]{64}\b/gi, '<digest>')
    .replace(/\b[a-f0-9]{64}\b/gi, '<digest>');
  const result = { error: code, message };
  if (typeof error.details?.failed_field === 'string') result.field = error.details.failed_field;
  if (Array.isArray(error.details?.allowed_values)) result.allowed = error.details.allowed_values;
  if (/^generation_|^selection_required$|^choice_unresolved$/.test(code)) {
    result.next = 'Run the original context request again and select a returned choice.';
  }
  return result;
}
