import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const EXPECTED_PACKAGE_ID = 'aleph-t04-real-information-board-public-contract-v2';
const projectRoot = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const packageRoot = process.argv[2] ? resolve(process.argv[2]) : null;

if (!packageRoot) {
  console.error('사용법: node scripts/verify-public-package.mjs <공개 package 폴더>');
  process.exitCode = 1;
} else {
  const failures = [];
  const pass = (label) => console.log(`PASS · ${label}`);
  const fail = (label) => { failures.push(label); console.error(`FAIL · ${label}`); };
  const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
  const sha256 = (data) => createHash('sha256').update(data).digest('hex');
  const canonicalize = (value) => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
    }
    return value;
  };

  try {
    const contract = await json(join(packageRoot, 'public-contract.json'));
    const assets = await json(join(packageRoot, 'asset-manifest.json'));
    const fixtureManifest = await json(join(packageRoot, 'fixture-manifest.json'));

    if (contract.package_id === EXPECTED_PACKAGE_ID && assets.package_id === EXPECTED_PACKAGE_ID) pass(`package ID ${EXPECTED_PACKAGE_ID}`);
    else fail('public-contract.json과 asset-manifest.json의 package ID');
    if (contract.contract_version === '2.0.0' && contract.condition_count === 35) pass('공개 계약 2.0.0 · 조건 35개');
    else fail('공개 계약 버전 또는 조건 개수');
    if (fixtureManifest.contract_version === '1.1.0' && fixtureManifest.fixtures.length === 9) pass('fixture 계약 1.1.0 · fixture 9개');
    else fail('fixture 계약 버전 또는 fixture 개수');

    let assetPasses = 0;
    for (const entry of assets.files) {
      try {
        const data = await readFile(join(packageRoot, entry.path));
        if (data.length === entry.bytes && sha256(data) === entry.sha256) assetPasses++;
        else fail(`파일 무결성 ${entry.path}`);
      } catch { fail(`파일 누락 ${entry.path}`); }
    }
    if (assetPasses === assets.files.length) pass(`파일 크기·SHA-256 ${assetPasses}/${assets.files.length}`);

    let canonicalPasses = 0;
    let projectPasses = 0;
    for (const entry of fixtureManifest.fixtures) {
      try {
        const source = await json(join(packageRoot, 'fixtures', entry.file));
        const canonicalHash = `sha256-${sha256(JSON.stringify(canonicalize(source)))}`;
        if (canonicalHash === entry.canonical_sha256) canonicalPasses++;
        else fail(`fixture canonical hash ${entry.fixture_id}`);
        const local = await json(join(projectRoot, 'fixtures', entry.file));
        if (JSON.stringify(canonicalize(local)) === JSON.stringify(canonicalize(source))) projectPasses++;
        else fail(`프로젝트 fixture 내용 ${entry.fixture_id}`);
      } catch { fail(`fixture 누락 또는 JSON 오류 ${entry.fixture_id}`); }
    }
    if (canonicalPasses === fixtureManifest.fixtures.length) pass(`fixture canonical hash ${canonicalPasses}/${fixtureManifest.fixtures.length}`);
    if (projectPasses === fixtureManifest.fixtures.length) pass(`프로젝트 fixture 대조 ${projectPasses}/${fixtureManifest.fixtures.length}`);

    if (failures.length) {
      console.error(`\n검증 실패: ${failures.length}건`);
      process.exitCode = 1;
    } else console.log('\n공개 package와 프로젝트 fixture가 모두 정본과 일치합니다.');
  } catch (error) {
    console.error(`검증을 시작하지 못했습니다: ${error.message}`);
    process.exitCode = 1;
  }
}
