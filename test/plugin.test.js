import cuid from 'cuid'
import { format } from 'date-fns'
import fs from 'fs-extra'
import { chainable } from 'iterablefu'
import { tmpdir } from 'os'
import { join } from 'path'
import { test } from 'zora'
import createTestPackageJson from '../src/plugin'

const makeTempPath = (prefix) => {
  // formatISO emits colons for the time part, which can be problematic on command lines as NPM parameters
  const timePart = format(Date.now(), 'yyyy-MM-dd-kk-mm')
  return join(tmpdir(), `${prefix}-${timePart}-${cuid.slug()}`) // slug provides uniqueness in same minute
}

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

  writeJson (path, json) {
    this.path = path
    this.packageJson = json
  }
}

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

const excercisePlugin = async (packageJson, testPackageJson) => {
  const writer = new FakeJsonWriter()
  const plugin = createTestPackageJson({
    packageJson,
    testPackageJson,
    jsonWriter: async (j, p, o) => { writer.writeJson(j, p, o) }
  })
  await plugin.renderStart()
  await plugin.writeBundle({ dir: 'do-not-care' }, fakeBundles)
  return writer
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

test('does not load external package.json when one is provided', async assert => {
  const packageJson = {}
  const plugin = createTestPackageJson({ packageJson, rootDir: makeTempPath('does-not-exist') })
  // Yes, we're cheating a bit and using internal knowledge of the plugin
  const actualPackageJson = await plugin.renderStart()
  assert.deepEqual(actualPackageJson, {}, 'did not load a package.json')
})

/*
  From here on package.json will be provided as an option to the test
  so that it does not read from the filesystem. There is no test
  called 'uses packageJson provided as option' because ALL of the
  following tests do.
*/

test('uses outputOptions.dir for package.json location if available', async assert => {
  const writer = new FakeJsonWriter()
  const plugin = createTestPackageJson({
    fakePackageJson,
    jsonWriter: async (j, p, o) => { writer.writeJson(j, p, o) }
  })
  await plugin.renderStart()
  await plugin.writeBundle({ dir: 'do-not-care' }, fakeBundles)
  assert.deepEqual(writer.path, join('do-not-care', 'package.json'), 'dir used correctly')
})

test('infers package.json output path from outputOptions.file if provided', async assert => {
  const writer = new FakeJsonWriter()
  const plugin = createTestPackageJson({
    fakePackageJson,
    jsonWriter: async (j, p, o) => { writer.writeJson(j, p, o) }
  })
  await plugin.renderStart()
  await plugin.writeBundle({ file: join('do-not-care', 'bundle.js') }, fakeBundles)
  assert.deepEqual(writer.path, join('do-not-care', 'package.json'), 'file used correctly')
})

test('accepts Promise in packageJson option', async assert => {
  const packageJsonPromise = Promise.resolve(fakePackageJson)
  const writer = await excercisePlugin(packageJsonPromise, undefined)
  const actualDependencies = writer.packageJson.dependencies
  const expectedDependencies = buildExpectedDependencies(fakePackageJson, fakeBundles)
  assert.deepEqual(actualDependencies, expectedDependencies, 'dependencies generated correctly')
})

test('gets dependencies from bundles, and versions from package.json', async assert => {
  const writer = await excercisePlugin(fakePackageJson, undefined)
  const actualDependencies = writer.packageJson.dependencies
  const expectedDependencies = buildExpectedDependencies(fakePackageJson, fakeBundles)
  assert.deepEqual(actualDependencies, expectedDependencies, 'dependencies generated correctly')
})

test('appends to provided dependencies', async assert => {
  const testPackageJson = { dependencies: { 'date-fns': '^2.14.0' } } // date-fns not in fakeBundles
  const writer = await excercisePlugin(fakePackageJson, testPackageJson)
  const actualDependencies = writer.packageJson.dependencies
  const expectedDependencies = {
    ...buildExpectedDependencies(fakePackageJson, fakeBundles),
    ...testPackageJson.dependencies
  }
  assert.deepEqual(actualDependencies, expectedDependencies, 'bundle dependencies appended')
})

test('accepts Promise as testPackageJson parameter', async assert => {
  const dependencies = { 'date-fns': '^2.14.0' }
  const promiseTestPackageJson = Promise.resolve({ dependencies }) // date-fns not in fakeBundles
  const writer = await excercisePlugin(fakePackageJson, promiseTestPackageJson)
  const actualDependencies = writer.packageJson.dependencies
  const expectedDependencies = {
    ...buildExpectedDependencies(fakePackageJson, fakeBundles),
    ...dependencies
  }
  assert.deepEqual(actualDependencies, expectedDependencies, 'bundle dependencies appended')
})

// Copied from plugin and tweaked just a bit for unit test
const defaultFieldValues = {
  name: `${fakePackageJson.name}-package-test`,
  version: '1.0.0',
  description: `Generated package test for ${fakePackageJson.name}`,
  main: 'index.js',
  scripts: {},
  author: 'rollup-plugin-test-package-json',
  devDependencies: {}
}

const specifiedFieldValues = {
  name: 'unit-test-package-test',
  version: '42.0.1-alpha00',
  description: 'unit-test-values-for-testing',
  main: 'mighty-plugin.mjs',
  scripts: { test: 'tape -r esm src/**/*.js' },
  author: 'rollup-plugin-test-package-json',
  devDependencies: { iterablefu: '^0.4.1' }
}

chainable
  .zipAll(
    Object.keys(defaultFieldValues),
    Object.values(defaultFieldValues),
    Object.values(specifiedFieldValues)
  )
  .forEach(([name, defaultValue, specifiedValue]) => {
    test(`when ${name} is unspecified in testPackageJson, default value is provided`, async assert => {
      const writer = await excercisePlugin(fakePackageJson, undefined)
      const actual = writer.packageJson[name]
      assert.deepEqual(actual, defaultValue, `default ${name} provided correctly`)
    })

    test(`when ${name} is specified in testPackageJson, it is returned unchanged`, async assert => {
      const testPackageJson = { [name]: specifiedValue }
      const writer = await excercisePlugin(fakePackageJson, testPackageJson)
      const actual = writer.packageJson[name]
      assert.deepEqual(actual, specifiedValue, `specified ${name} provided correctly`)
    })
  })
