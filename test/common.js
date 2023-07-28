import createTestPackageJson from 'rollup-plugin-create-test-package-json'
import { chainable } from 'iterablefu'

export const isString = (item) => typeof item === 'string' || item instanceof String

/**
 * A packageJson object to stand in for the project's package.json file.
 */
export const fakePackageJson = {
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

/**
 * A fake Rollup bundle, with just enough data for the plugin to operate.
 */
export const fakeBundles = {
  dep1: { type: 'chunk', imports: ['lodash', 'underscore', 'cuid'] },
  // next ensure duplicates are handled: lodash,
  // additional imports handled: zora
  // and devDependencies from package.json handled: zora again
  dep2: { type: 'chunk', imports: ['lodash', 'zora'] },
  dep3: { type: 'chunk', imports: [] }, // ensure handles empty imports
  dep4: { type: 'asset' } // ensure handles non-chunks, it would fail when accessing imports field
}

/**
 * Substitute for plugin's default jsonWriter. This one saves the output data
 * so the test can check it. See exercisePlugin for usage.
 */
export class FakeJsonWriter {
  constructor () {
    this.path = undefined
    this.packageJson = undefined
  }

  writeJson (path, json) {
    this.path = path
    this.packageJson = json
  }
}

/**
 * @typedef {Object} TestResult - Provides constructor function and function name.
 * @property {FakeJsonWriter} writer - the writer that collected path and packageJson output
 * @property {String} actualError - null if no error, the error message string if error
 */

/**
 * Run the plugin in a minimal Rollup like context to retrieve validation data.
 *
 * @param {Object} packageJson - the packageJson option to the plugin
 * @param {Object} testPackageJson - the testPackage option to the plugin
 * @returns {TestResult} plugin outputs
 */
export const exercisePlugin = async (packageJson, testPackageJson, userOptions = {}) => {
  // Usually, the plugin writes to file. Setup to capture path and output.
  const writer = new FakeJsonWriter()
  const jsonWriter = async (j, p, o) => { writer.writeJson(j, p, o) }
  // Setup plugin options
  const options = {
    ...userOptions,
    jsonWriter
  }
  // When user does not provide parameter, don't want to add it to options.
  if (packageJson) options.packageJson = packageJson
  if (testPackageJson) options.testPackageJson = testPackageJson
  const plugin = createTestPackageJson(options)
  // create the least possible context for the plugin to work in
  let error, warning
  const rollupContext = {
    ...plugin,
    error (msg) { error = msg },
    warn (msg) { warning = msg }
  }
  // run the plugin
  await rollupContext.renderStart() // plugin does not use outputOptions or inputOptions parameters for renderStart
  if (error === undefined) await rollupContext.writeBundle({ dir: 'do-not-care' }, fakeBundles)
  return { writer, error, warning }
}

/**
 * Build the dependencies that the plugin should generate. This does not cover all cases,
 * so some tweaking of the output may be required.
 *
 * NOTE: Does not take testPackageJson or checkSemverConflicts into account.
 *
 * @param {Object} packageJson - packageJson object that plugin will be passed
 * @param {Object} bundles - almost always fakeBundles
 * @returns {Object} - just the dependencies part of the expected output.
 */
export const buildExpectedDependencies = (packageJson, bundles) => {
  // get all dependencies together so we can easily get the semver strings for each.
  const semverStringsbyPackageName = { ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.peerDependencies }
  // test project needs dependency on any peerDependencies of project we're testing.
  const peerDependencyEntries = packageJson.peerDependencies ? Object.entries(packageJson.peerDependencies) : []
  // generate the devDependency entries from bundle
  const devDependencyEntries = chainable(Object.values(bundles))
    .filter(chunk => chunk.type === 'chunk')
    .pluck('imports')
    .flatten()
    .map(name => [name, semverStringsbyPackageName[name]])
    .toArray()
    .concat(peerDependencyEntries)
  return {
    dependencies: { 'fake-package': 'file:fake-package-1.0.0-superfake.tgz' },
    devDependencies: Object.fromEntries(devDependencyEntries)
  }
}

/**
 * Extracts just the dependency fields from a packageJson object.
 *
 * @param {Object} packageJson - a packageJson type object
 * @returns {Object} - has just the dependency fields from packageJson: dependencies, devDependencies, peerDependencies
 */
export const extractDependencies = (packageJson) => {
  const extracted = {}
  // Don't want to add keys that don't exist in packageJson, so do it the hard way
  if (packageJson.dependencies) extracted.dependencies = packageJson.dependencies
  if (packageJson.devDependencies) extracted.devDependencies = packageJson.devDependencies
  if (packageJson.peerDependencies) extracted.peerDependencies = packageJson.peerDependencies
  return extracted
}

/**
 * Compares two dependency objects without regard to field order.
 * The zora deepEqual check cares about field order in objects.
 *
 * @param {Object} packageJsonA - packageJson object
 * @param {Object} packageJsonB - packageJson object
 * @returns {boolean} - if packageJsonA dependencies are equivalent to packageJsonB dependencies
 */
export const dependenciesAreEquivalent = (packageJsonA, packageJsonB) => {
  // check that all fields in b are in a
  const containsFieldsOfB = (a, b) => chainable(Object.entries(b))
    .map(([dependencyKey, dependencies]) => {
      return Object.entries(dependencies)
        .map(([packageName, semverRange]) => {
          return [dependencyKey, packageName, semverRange]
        })
    })
    .flatten() // flatten to list of [dependencyKey, packageName, semverRange]
    .map(([dependencyKey, packageName, semverRange]) => {
      // check that field in b is also in a and that it is the same
      const hasDependencyKey = a[dependencyKey] !== undefined
      const semverRangesEqual = a[dependencyKey][packageName] === semverRange
      return hasDependencyKey && semverRangesEqual
    })
    .filter(result => !result)
    .toArray()

  const dependenciesA = extractDependencies(packageJsonA)
  const dependenciesB = extractDependencies(packageJsonB)
  // containsFieldsOfB needs to be run in both directions for a complete check.
  // For equivalence, verify all the fields in a are in b AND all the fields in b are in a
  const failures = containsFieldsOfB(dependenciesA, dependenciesB).concat(containsFieldsOfB(dependenciesB, dependenciesA))
  return failures.length === 0
}
