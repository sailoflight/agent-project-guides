// Parser worker only. Never link, instantiate or evaluate a checked-out module.
import fs from 'node:fs';
import vm from 'node:vm';
try {
  const files = JSON.parse(fs.readFileSync(0, 'utf8'));
  const result = files.map(({ file, text }) => {
    const module = new vm.SourceTextModule(text, { identifier: file });
    if (module.status !== 'unlinked') throw new Error(`unexpected parser state: ${file}`);
    return { file, imports: [...module.dependencySpecifiers].sort() };
  });
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(`ESM parser failed: ${error.message}\n`);
  process.exitCode = 1;
}
