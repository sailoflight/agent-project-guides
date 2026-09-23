import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Trusted-local safety primitive, not a hostile-filesystem isolation boundary.
// Only remove a temporary file that this call created; a collision is zero-write.
export function writeFileAtomic(file, bytes, { mode = 0o644, temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`, durable = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(temporary, 'wx', mode);
  try {
    try {
      fs.writeFileSync(fd, bytes);
      if (durable) fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
    if (durable) {
      fsyncDirectory(path.dirname(file));
    }
  } finally { fs.rmSync(temporary, { force: true }); }
}

export function fsyncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
