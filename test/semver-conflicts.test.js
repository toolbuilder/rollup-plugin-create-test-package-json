import { exercisePlugin, fakePackageJson, isString } from './common.js'
import { test } from 'zora'

test('options.checkSemverConflicts is false by default', async assert => {
  // Provide higher, incompatible, version of zora than the one in fakePackageJson
  const testPackageJson = { devDependencies: { cuid: '^3.0.0', zora: '^5.2.1' } }
  const { error, writer } = await exercisePlugin(fakePackageJson, testPackageJson)
  assert.notOk(isString(error), 'plugin did not check for semver conflicts')
  assert.ok(isString(writer.path), 'plugin continued to generate the plugin')
})

test('options.checkSemverConflicts option can be set to false', async assert => {
  // Provide higher, incompatible, version of zora than the one in fakePackageJson
  const testPackageJson = { devDependencies: { cuid: '^3.0.0', zora: '^5.2.1' } }
  const { error, writer } = await exercisePlugin(fakePackageJson, testPackageJson, { checkSemverConflicts: false })
  assert.notOk(isString(error), 'plugin did not check for semver conflicts')
  assert.ok(isString(writer.path), 'plugin continued to generate the plugin')
})

test('testPackageJson has incompatible dependency with package under test in devDependencies section', async assert => {
  // Provide higher, incompatible, version of zora than the one in fakePackageJson
  const testPackageJson = { devDependencies: { cuid: '^3.0.0', zora: '^5.2.1' } }
  const { error, writer } = await exercisePlugin(fakePackageJson, testPackageJson, { checkSemverConflicts: true })
  assert.ok(isString(error), 'plugin detected error and provided error message')
  if (error) {
    assert.ok(error.startsWith('Cannot create package.json.'), 'received correct error message')
    assert.ok(error.includes('zora'), 'The dependency conflict with zora is identified')
    assert.ok(error.includes('cuid'), 'The dependency conflict with cuid is identified')
  }
  assert.ok(writer.path === undefined, 'plugin did not write package.json')
  assert.ok(writer.packageJson === undefined, 'plugin did not write to package.json')
})

test('testPackageJson has incompatible depdendency with package under test in dependencies section', async assert => {
  // Provide higher, incompatible, version of zora than the one in fakePackageJson
  const testPackageJson = { dependencies: { zora: '^5.2.1' } }
  const { error, writer } = await exercisePlugin(fakePackageJson, testPackageJson, { checkSemverConflicts: true })
  assert.ok(isString(error), 'plugin detected error and provided error message')
  if (error) {
    assert.ok(error.startsWith('Cannot create package.json.'), 'received correct error message')
    assert.ok(error.includes('zora'), 'The dependency conflict with zora is identified')
  }
  assert.ok(writer.path === undefined, 'plugin did not write package.json')
  assert.ok(writer.packageJson === undefined, 'plugin did not write to package.json')
})

test('testPackageJson has incompatible dependency that is NOT provided by Rollup bundle', async assert => {
  // Provide higher, incompatible, version of tape than the one in fakePackageJson
  // However, unlike the test above, tape is NOT in fakeBundles (e.g. wasn't in the code Rollup is processing).
  const testPackageJson = { devDependencies: { tape: '^6.0.0' } }
  const { error, writer } = await exercisePlugin(fakePackageJson, testPackageJson, { checkSemverConflicts: true })
  assert.ok(isString(error), 'plugin detected error and provided error message')
  if (error) {
    assert.ok(error.startsWith('Cannot create package.json.'), 'received correct error message')
    assert.ok(error.includes('tape'), 'The dependency conflict with zora is identified')
  }
  assert.ok(writer.path === undefined, 'plugin did not write package.json')
  assert.ok(writer.packageJson === undefined, 'plugin did not write to package.json')
})

test('testPackageJson has compatible dependency with package under test', async assert => {
  // Provide higher, compatible, version of zora than the one in fakePackageJson
  const testPackageJson = { dependencies: { zora: '^3.2.8' } }
  const { error } = await exercisePlugin(fakePackageJson, testPackageJson)
  assert.ok(!isString(error), 'plugin did not provide error message')
})
