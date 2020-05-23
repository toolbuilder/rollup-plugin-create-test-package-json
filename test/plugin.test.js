import cuid from 'cuid'
import { format } from 'date-fns'
import fs from 'fs-extra'
import { tmpdir } from 'os'
import { join } from 'path'
import { test } from 'zora'
import createTestPackageJson from '../src/plugin'
import { chainable } from 'iterablefu'

const makeTempPath = (prefix) => {
  // formatISO emits colons for the time part, which can be problematic on command lines as NPM parameters
  const timePart = format(Date.now(), 'yyyy-MM-dd-kk-mm')
  return join(tmpdir(), `${prefix}-${timePart}-${cuid.slug()}`) // slug provides uniqueness in same minute
}

test('loads package.json from default location', async assert => {
  const plugin = createTestPackageJson()
  const actualPackageJson = await plugin.renderStart()
  const expectedPackageJson = await fs.readJSON(join(process.cwd(), 'package.json'))
  assert.deepEqual(actualPackageJson, expectedPackageJson, 'loaded package.json correctly')
})

test('loads package.json from specified location', async assert => {
  const rootDir = makeTempPath('create-test-package-json')
  await fs.ensureDir(rootDir)
  const srcPath = join(process.cwd(), 'package.json')
  const dstPath = join(rootDir, 'package.json')
  const expectedPackageJson = await fs.readJSON(srcPath)
  expectedPackageJson.description = 'some other description so it does not look exactly like local package.json'
  await fs.writeJSON(dstPath, expectedPackageJson, { spaces: 2 })
  const plugin = createTestPackageJson({ rootDir })
  const actualPackageJson = await plugin.renderStart() // Rollup wouldn't use this return value
  assert.deepEqual(actualPackageJson, expectedPackageJson, 'loaded package.json correctly')
})

const fakeBundles = {
  dep1: { type: 'chunk', imports: ['lodash', 'underscore', 'cuid'] },
  // next ensure duplicates are handled: lodash,
  // additional imports handled: zora
  // and devDependencies from package.json handled: zora again
  dep2: { type: 'chunk', imports: ['lodash', 'zora'] },
  dep3: { type: 'chunk', imports: [] }, // ensure handles empty imports
  dep4: { type: 'asset' } // ensure handles non-chunks, it would fail when accessing imports field
}

const fakePackageJson = {
  name: 'fake-package',
  version: '1.0.0-superfake',
  dependencies: {
    esm: '^3.2.25',
    lodash: '^1.23.2343',
    underscore: '^12.2.3',
    cuid: '^2.1.8'
  },
  devDependencies: {
    zora: '^3.1.8',
    'npm-run-all': '^4.1.5',
    tape: '^5.0.0'
  }
}

class FakeJsonWriter {
  constructor () {
    this.path = undefined
    this.packageJson = undefined
  }

  writeJson (path, json, options) {
    this.path = path
    this.packageJson = json
  }
}

test('does not load external package.json when one is provided', async assert => {
  const packageJson = {}
  const plugin = createTestPackageJson({ packageJson, rootDir: makeTempPath('does-not-exist') })
  // Yes, we're cheating a bit and using internal knowledge of the plugin
  const actualPackageJson = await plugin.renderStart()
  assert.deepEqual(actualPackageJson, {}, 'did not load a package.json')
})

test('calls jsonWriter correctly', async assert => {
  const writer = new FakeJsonWriter()
  const plugin = createTestPackageJson({
    packageJson: fakePackageJson,
    jsonWriter: async (j, p) => { writer.writeJson(j, p) }
  })
  await plugin.renderStart()
  const dir = 'path/to/json'
  await plugin.writeBundle({ dir }, {})
  assert.deepEqual(writer.path, join(dir, 'package.json'), 'used correct path')
  assert.ok(writer.packageJson != null, 'used packageJson') // we'll check better in other tests
})

// Although done programmatically, the implementation is substantially different from the plugin's
const buildExpectedDependencies = (packageJson, bundles) => {
  const allDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
  const expectedEntries = chainable(Object.values(bundles))
    .filter(chunk => chunk.type === 'chunk')
    .pluck('imports')
    .flatten()
    .map(name => [name, allDependencies[name]])
    .toArray()
    .concat([['fake-package', 'file:fake-package-1.0.0-superfake.tgz']])
  return Object.fromEntries(expectedEntries)
}

test('gets dependencies from bundles, and versions from package.json', async assert => {
  const writer = new FakeJsonWriter()
  const plugin = createTestPackageJson({
    packageJson: fakePackageJson,
    jsonWriter: async (j, p, o) => { writer.writeJson(j, p, o) }
  })
  await plugin.renderStart()
  const dir = 'path/to/json'
  await plugin.writeBundle({ dir }, fakeBundles)
  const actualDependencies = writer.packageJson.dependencies
  const expectedDependencies = buildExpectedDependencies(fakePackageJson, fakeBundles)
  assert.deepEqual(actualDependencies, expectedDependencies, 'dependencies generated correctly')
})
