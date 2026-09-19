// Fixture content only. The release pilot gates read the root entry and the
// descriptor, never this file; it exists so the synthetic project has a
// plausible small-CLI shape rather than an empty tree.
export function main(argv) {
  if (argv.includes('--version')) {
    process.stdout.write('0.1.0\n');
    return 0;
  }
  process.stdout.write('synthetic pilot cli\n');
  return 0;
}
