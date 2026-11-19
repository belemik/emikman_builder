import { adoptDisposableVolume } from '../../server/projects/disposable-volume';
import { DisposableInitialDocumentRepository } from '../../server/projects/p22a-disposable-repository';
import { TestFixtureAuthority } from '../../server/projects/test-authority';
import { DOCUMENT_SNAPSHOT_VERSION } from '../../src/projects/document-snapshot.dto';

const [, , directory, account] = process.argv;
const authority = new TestFixtureAuthority([account]);
const repository = DisposableInitialDocumentRepository.reopen(adoptDisposableVolume(directory), authority);
try {
  const result = repository.create(authority.context(account), {
    version: DOCUMENT_SNAPSHOT_VERSION, type: 'web-application', name: 'Concurrent fixture',
  });
  console.log(JSON.stringify(result));
} finally {
  repository.close();
}
