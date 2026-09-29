// Where the live audits and browser checks write their reports. Set
// VERIFICATION_AUDIT_DIR to keep them somewhere; the default is a temporary
// folder.
import os from 'node:os';
import path from 'node:path';

export const auditDir = process.env.VERIFICATION_AUDIT_DIR || path.join(os.tmpdir(), 'verification-task-audit');
