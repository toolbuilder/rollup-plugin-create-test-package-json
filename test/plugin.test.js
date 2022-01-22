import { test } from 'zora'
import { buildExpectedDependencies, dependenciesAreEquivalent, exercisePlugin, extractDependencies, fakeBundles, fakePackageJson } from './common.js'

/*
  NOTE:

  Tests that touch the file system are all in file-access.test.js.

  Tests in this module all provide package.json as an option so that the
  plugin does not read from the filesystem.

  There is no test called 'uses packageJson provided as option' because ALL of the
  following tests do.

  The function buildExpectedDependencies tests dependency structure for generated packageJson
  in all tests that use it.
*/

test('gets dependencies from bundles, and version strings from package.json', async assert => {
  const { writer } = await exercisePlugin(fakePackageJson, undefined)
  const expectedDependencies = buildExpectedDependencies(fakePackageJson, fakeBundles)
  assert.ok(dependenciesAreEquivalent(writer.packageJson, expectedDependencies), 'dependencies generated correctly')
})

test('includes peer dependencies from packageJson in generated packageJson', async assert => {
  const packageJson = { ...fakePackageJson, peerDependencies: { georgeOfTheJungle: '^2.32.23' } }
  const { writer } = await exercisePlugin(packageJson, undefined)
  const expectedDependencies = buildExpectedDependencies(packageJson, fakeBundles)
  assert.ok(dependenciesAreEquivalent(writer.packageJson, expectedDependencies), 'bundle dependencies appended')
})

test('appends testPackageJson dependencies to generated packageJson', async assert => {
  // Specify a dependency in testPackageJson that is not used in unit tests
  const testPackageJson = { dependencies: { 'date-fns': '^2.14.0' } }
  const { writer } = await exercisePlugin(fakePackageJson, testPackageJson)
  const expectedDependencies = buildExpectedDependencies(fakePackageJson, fakeBundles)
  // buildExpectedDependencies doesn't have access to testPackageJson, so we have to add that in now
  expectedDependencies.dependencies = { ...expectedDependencies.dependencies, ...testPackageJson.dependencies }
  assert.ok(dependenciesAreEquivalent(writer.packageJson, expectedDependencies), 'testPackageJson.dependencies appended')
})

// The other options don't have to be provided either. That is tested in file-access.test.js
test('testPackageJson does not have to be provided as option', async assert => {
  // excercisePlugin treats undefined as 'not provided'
  const { writer } = await exercisePlugin(fakePackageJson, undefined)
  const expectedDependencies = buildExpectedDependencies(fakePackageJson, fakeBundles)
  assert.ok(dependenciesAreEquivalent(writer.packageJson, expectedDependencies), 'dependencies generated correctly')
})

test('appends testPackageJson devDependencies to generated packageJson', async assert => {
  // Specify a dependency in testPackageJson that is not used in unit tests
  const testPackageJson = { devDependencies: { 'date-fns': '^2.14.0' } }
  const { writer } = await exercisePlugin(fakePackageJson, testPackageJson)
  const expectedDependencies = buildExpectedDependencies(fakePackageJson, fakeBundles)
  // buildExpectedDependencies doesn't have access to testPackageJson, so we have to add that in now
  expectedDependencies.devDependencies = { ...expectedDependencies.devDependencies, ...testPackageJson.devDependencies }
  assert.ok(dependenciesAreEquivalent(writer.packageJson, expectedDependencies), 'testPackageJson.devDependences appended')
})

// This use case doesn't seem to make much sense for a test project, but is part of testing testPackageJson merge
test('appends testPackageJson peerDependencies to generated packageJson', async assert => {
  // Specify a dependency in testPackageJson that is not used in unit tests
  const testPackageJson = { peerDependencies: { 'date-fns': '^2.14.0' } }
  const { writer } = await exercisePlugin(fakePackageJson, testPackageJson)
  const expectedDependencies = buildExpectedDependencies(fakePackageJson, fakeBundles)
  // buildExpectedDependencies doesn't generate peerDependencies so need to add now
  expectedDependencies.peerDependencies = testPackageJson.peerDependencies
  assert.ok(dependenciesAreEquivalent(writer.packageJson, expectedDependencies), 'testPackageJson.devDependences appended')
})

test('chooses testPackageJson dependencies when they are also unit test dependencies', async assert => {
  // Specify dependencies in testPackageJson that *are* used in unit tests.
  // Provide higher versions to verify that they are used.
  const testPackageJson = {
    dependencies: { underscore: '^12.4.2' }, // ensure removes calculated from devDependencies
    devDependencies: { zora: '^3.2.0' }, // ensure changes semver range in devDependencies
    peerDependencies: { cuid: '^2.2.2' } // ensure removes calculated from devDependencies
  }
  const { writer } = await exercisePlugin(fakePackageJson, testPackageJson)
  const actualDependencies = extractDependencies(writer.packageJson)
  const expectedDependencies = buildExpectedDependencies(fakePackageJson, fakeBundles)
  // buildExpectedDependencies does not have access to testPackageJson, so need to tweak output
  expectedDependencies.dependencies.underscore = testPackageJson.dependencies.underscore
  delete expectedDependencies.devDependencies.underscore
  expectedDependencies.devDependencies.zora = testPackageJson.devDependencies.zora
  expectedDependencies.peerDependencies = {}
  expectedDependencies.peerDependencies.cuid = testPackageJson.peerDependencies.cuid
  delete expectedDependencies.devDependencies.cuid
  assert.ok(dependenciesAreEquivalent(actualDependencies, expectedDependencies), 'testPackageJson dependencies used')
})

test('accepts Promise as testPackageJson parameter', async assert => {
  const testPackageJson = { dependencies: { 'date-fns': '^2.14.0' } }
  const promiseTestPackageJson = Promise.resolve(testPackageJson) // date-fns not in fakeBundles
  const { writer } = await exercisePlugin(fakePackageJson, promiseTestPackageJson)
  const expectedDependencies = buildExpectedDependencies(fakePackageJson, fakeBundles)
  // buildExpectedDependencies doesn't have access to testPackageJson, so we have to add that in now
  expectedDependencies.dependencies = { ...expectedDependencies.dependencies, ...testPackageJson.dependencies }
  assert.ok(dependenciesAreEquivalent(writer.packageJson, expectedDependencies), 'bundle dependencies appended')
})

test('accepts Promise in packageJson option', async assert => {
  const packageJsonPromise = Promise.resolve(fakePackageJson)
  const { writer } = await exercisePlugin(packageJsonPromise, undefined)
  const expectedDependencies = buildExpectedDependencies(fakePackageJson, fakeBundles)
  assert.ok(dependenciesAreEquivalent(writer.packageJson, expectedDependencies), 'dependencies generated correctly')
})
