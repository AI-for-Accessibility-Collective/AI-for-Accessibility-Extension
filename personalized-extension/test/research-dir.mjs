// Some tests replay recorded pages and human-written task models from the
// research project, which are not in this repository. Point
// VERIFICATION_RESEARCH_DIR at a copy to run them; without it they skip.
import { existsSync } from 'node:fs';

export function researchDir(test) {
  const dir = process.env.VERIFICATION_RESEARCH_DIR;
  if (!dir || !existsSync(dir)) {
    console.log(`SKIP ${test}: set VERIFICATION_RESEARCH_DIR to replay the recorded research pages`);
    process.exit(0);
  }
  return dir;
}
