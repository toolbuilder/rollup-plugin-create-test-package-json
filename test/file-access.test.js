import { test } from 'zora'
import fs from 'fs-extra'
import { tmpdir } from 'os'
import { join } from 'path'
import createTestPackageJson from 'rollup-plugin-create-test-package-json'
import { exercisePlugin, fakeBundles, FakeJsonWriter, fakePackageJson, isString } from './common.js'
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('1234567890abcdef', 10)
const makeTempPath = (prefix) => join(tmpdir(), `${prefix}-${Date.now()}-${nanoid()}`)

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

test('Error provided to Rollup if package.json cannot be found', async assert => {
  const rootDir = makeTempPath('directory-without-package-json')
  await fs.ensureDir(rootDir)
  const { error } = await exercisePlugin(undefined, undefined, { rootDir })
  assert.ok(error, 'Rollup context was provided error message')
  assert.ok(isString(error), 'error message is string')
  if (error) {
    assert.ok(error.includes('Could not find package.json'), 'Correct error message received')
  }
})

test('Error provided to Rollup if package.json cannot be read', async assert => {
  const rootDir = makeTempPath('directory-without-package-json')
  await fs.ensureDir(rootDir)
  const packageJsonPath = join(rootDir, 'package.json')
  await fs.writeFile(packageJsonPath, 'not JSON in package.json')
  const { error } = await exercisePlugin(undefined, undefined, { rootDir })
  assert.ok(error, 'Rollup context was provided error message')
  assert.ok(isString(error), 'error message is string')
  if (error) {
    assert.ok(error.startsWith("Problem loading package.json, check 'rootDir' option"))
    assert.ok(error.includes(packageJsonPath), 'error message includes problem with JSON file')
  }
})

test('Plugin will walk project hierarchy to find package.json', async assert => {
  // There is no package.json in the src directory, but is one above it
  const rootDir = join(process.cwd(), 'src')
  const { error } = await exercisePlugin(undefined, undefined, { rootDir })
  // Given that we've already tested what happens when package.json is missing,
  // not generating an error implies that package.json was found.
  assert.ok(!isString(error), 'found package.json')
})

test('does not load external package.json when one is provided', async assert => {
  const packageJson = {}
  const plugin = createTestPackageJson({ packageJson, rootDir: makeTempPath('does-not-exist') })
  // Yes, we're cheating a bit and using internal knowledge of the plugin
  const actualPackageJson = await plugin.renderStart()
  assert.deepEqual(actualPackageJson, {}, 'did not load a package.json')
})

test('uses Rollup config outputOptions.dir for package.json location if available', async assert => {
  const writer = new FakeJsonWriter()
  const plugin = createTestPackageJson({
    packageJson: fakePackageJson,
    jsonWriter: async (j, p, o) => { writer.writeJson(j, p, o) }
  })
  await plugin.renderStart()
  await plugin.writeBundle({ dir: 'rollup-input-dir' }, fakeBundles)
  assert.deepEqual(writer.path, join('rollup-input-dir', 'package.json'), 'dir used correctly')
})

test('infers package.json output path from Rollup config outputOptions.file if provided', async assert => {
  const writer = new FakeJsonWriter()
  const plugin = createTestPackageJson({
    packageJson: fakePackageJson,
    jsonWriter: async (j, p, o) => { writer.writeJson(j, p, o) }
  })
  await plugin.renderStart()
  await plugin.writeBundle({ file: join('do-not-care', 'bundle.js') }, fakeBundles)
  assert.deepEqual(writer.path, join('do-not-care', 'package.json'), 'file used correctly')
})

test('uses outputDir when provided as an option insted of using Rollup config outputOptions.file', async assert => {
  const writer = new FakeJsonWriter()
  const outputDir = 'user-specified-output-dir'
  const plugin = createTestPackageJson({
    packageJson: fakePackageJson,
    outputDir,
    jsonWriter: async (j, p, o) => { writer.writeJson(j, p, o) }
  })
  await plugin.renderStart()
  await plugin.writeBundle({ file: join('do-not-care', 'bundle.js') }, fakeBundles)
  assert.deepEqual(writer.path, join(outputDir, 'package.json'), 'outputDir option used correctly')
})
