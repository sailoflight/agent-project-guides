// The measured foreign-marker vocabulary, in one place because two consumers need
// it: the root-block guard (`scripts/manage-root-blocks.mjs`, P3) decides what it
// must refuse to reorder, and the observation ledger (`lib/observation-ledger.mjs`,
// P6) decides what it records. Splitting the definition would let the two disagree
// about which blocks exist, which is exactly the class of bug the census was run to
// find.
//
// Only start markers count for the guard - an end marker with no start above it is
// malformed input for its own writer, not a block APG could reorder. The forms are
// the measured vocabulary of the foreign writers found by the field census
// (decisions/0006 "Writer survey"), not a guess:
//   `br`/`bv`  <!-- br-agent-instructions-v1 -->   (version inside the marker)
//   `ee`       <!-- ee:agentsmd:begin generation=N hash=H -->
//   `slb`      <!-- slb:cursor-rules:start -->
//   `sbh`      <!-- sbh-docs:begin <section> -->
//   `frankenterm` <!-- frankenterm:start -->
//   `am`       <!-- am:blurb -->                   (no version token at all)
//   `ubs`      <!-- >>> Ultimate Bug Scanner quick reference (...) -->
//   `cass`     <!-- Auto-generated rules from cass-memory playbook -->
//              <project_rules>                     (bare container tag)
//   `ntm`      <INSTRUCTIONS>                      (bare container tag)
// The last four were added after the census. Three findings drove them: `am`
// suffixes `:blurb` instead of `:start`/`:begin`; `ubs` writes no namespaced
// marker at all; and two writers delimit their region without an HTML comment -
// `cass` with a spaced sentence marker plus a snake_case tag, `ntm` with an
// upper-case tag. Markers that no writer emits stay allowed on purpose: field
// scan literals such as `<!-- casr-machine-readable-v1 -->`,
// `<!-- BEGIN REOLINK_RAG_WSL_TOOL -->` and `<!-- >>> -->` are project prose, and
// refusing them would be over-refusal (test-install.sh P3 vocabulary).
export const FOREIGN_COMMENT_MARKER =
  /^<!--\s*(?:(?:>>>|<<<)\s+[A-Za-z0-9]|auto-generated\b|(?!agent-project-guides:)[a-z0-9_.:-]*(?:[.:-](?:start|begin|blurb)\b|-agent-instructions-v\d+\b))/i;
// Case-sensitive on purpose: a bare `<name>` container tag, either an all-caps
// tag (`<INSTRUCTIONS>`) or a snake_case one (`<project_rules>`). Ordinary HTML
// tags (`<br>`, `<div>`) and link-like text (`<https://x>`) do not qualify.
export const FOREIGN_TAG_MARKER = /^<(?:(?:[A-Z][A-Z0-9_]{2,})|(?:[a-z][a-z0-9]*_[a-z0-9_]+))>$/;
// APG's own managed marker lines, deliberately matched by a different rule than the
// foreign vocabulary: the guard exists to protect these, the ledger records them so
// that a clobber of APG's own region is as attributable as one of anybody else's.
// An integrity line is included because it is byte-level evidence about the block
// that carried it.
export const APG_MARKER = /^<!--\s*agent-project-guides:/;

export function looksForeignMarker(text) {
  return FOREIGN_COMMENT_MARKER.test(text) || FOREIGN_TAG_MARKER.test(text);
}

export function looksApgMarker(text) {
  return APG_MARKER.test(text);
}
