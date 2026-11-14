// Trusted worker entry, never executable request text.
import {register} from 'tsx/esm/api';
register();
await import('./c-test-worker.ts');
