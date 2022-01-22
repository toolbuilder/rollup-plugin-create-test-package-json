import fs from 'fs-extra'
import { dirname, join } from 'path'
import pkgDir from 'pkg-dir'
import merge from 'plain-object-merge'
import semver from 'semver'

/**
 * Reads the package.json for the project being tested.
 *
 * @param {String} rootDir - a path in the directory hierarchy of the project being tested.
 * @returns {Object} - An object that contains all the packageJson data.
 * @throws {Error} - throws if could not find package.json or read it as a JSON file.
 */
const readPackageJson = async (rootDir) => {
  const path = await pkgDir(rootDir)
  if (path === undefined) throw new Error('Could not find package.json at or above rootDir')
  const packageJsonPath = join(path, 'package.json')
  return fs.readJSON(packageJsonPath)
}

/**
 * Extract just the dependency fields of a packageJson object.
 *
 * @param {Object} packageJson - the packageJson object
 * @returns {Object} - just the dependency fields of packageJson
 */
const collectDependencies = (packageJson) => {
  return {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.peerDependencies || {})
  }
}

/**
 * Walk through Rollup bundle and collect dependency ids.
 *
 * @param {Object} bundle - the bundle parameter that Rollup passed to writeBundle
 * @returns {String[]} - array of external package names
 */
const collectDependenciesFromBundle = (bundle) => {
  const dependencies = []
  for (const chunk of Object.values(bundle)) {
    if (chunk.type === 'asset') continue
    dependencies.push(chunk.imports)
    // dependencies.push(chunk.dynamicImports) // TODO not sure what to do here
  }
  return dependencies.flat() // return Array of external package names
}

/**
 * Rollup just provides external dependency package names (e.g. 'lodash'), since
 * these dependencies must be in this package's 'package.json' file,
 * this function picks up the semantic ranges from there.
 *
 * @param {Object} packageJson - the packageJson for the project being tested
 * @param {String[]} testDependencies - array of dependency package names
 * @returns
 */
const collectDependencyVersions = (packageJson, testDependencies) => {
  const allPackageDependencies = collectDependencies(packageJson)
  const entries = testDependencies
    .map(dependency => [dependency, allPackageDependencies[dependency]])
  return Object.fromEntries(entries)
}

/**
 * Calculate dependency versions from Rollup's bundle, and the project package.json.
 *
 * @param {Object} packageJson - packageJson provided per this plugin's packageJson.
 * @param {Object} bundle - bundle passed in by Rollup to writeBundle
 * @returns {Object} versioned dependencies destined for packageJson.devDependencies
 */
const calculateUnitTestDependencies = (packageJson, bundle) => {
  const unitTestDependencyNames = collectDependenciesFromBundle(bundle)
  const testDependencies = collectDependencyVersions(packageJson, unitTestDependencyNames)
  // If a project has a peer dependency, then the test project will need that
  // dependency to use the packfile.
  const peerDependencies = packageJson.peerDependencies || {}
  return { ...testDependencies, ...peerDependencies }
}

/**
 * Create the dependency version string for the pack file being tested.
 * This is how npm will name the pack file when 'npm pack' is called.
 *
 * @param {Object} packageJson - packageJson for project that will be packed
 * @returns {String} the packfile name
 */
const packFileDependency = (packageJson) => {
  const name = packageJson.name.replace('@', '').replace('/', '-')
  const version = packageJson.version
  return `file:${name}-${version}.tgz`
}

/**
 * Generate the package.json JSON object for the project that will test the pack file.
 *
 * @param {Object} unitTestDependencies - the devDependencies section of the package.json
 * @param {Object} packageJson - packageJson for the project being tested
 * @param {Object} testPackageJson - packageJson fragments that are merged into the generated packageJson
 * @returns {Object} - the generated packageJson
 */
const generatePackageJson = (unitTestDependencies, packageJson, testPackageJson, options) => {
  // Specify the default values. They will be replaced by any fields specified
  // in testPackageJson during the merge at the end of this method.
  const defaultJson = {
    name: `${packageJson.name}-package-test`,
    version: '1.0.0',
    description: `Generated package test for ${packageJson.name}`,
    main: 'index.js',
    scripts: {},
    author: 'rollup-plugin-test-package-json'
  }

  // testPackageJson takes precedence over the generated dependencies if there is overlap.
  // Remove unit test depdendencies that are already in testPackageJson, this accepts
  // the testPackageJson semver range, and puts the dependency in the field specified by
  // testPackageJson (e.g. devDependencies, dependencies, peerDependencies)
  const allTestPackageJsonDependencies = collectDependencies(testPackageJson)
  const filteredUnitTestDependenciesEntries = Object.entries(unitTestDependencies)
    .filter(([packageName, semverRange]) => !allTestPackageJsonDependencies[packageName])
  const filteredUnitTestDependencies = Object.fromEntries(filteredUnitTestDependenciesEntries)

  const generatedDependencies = {
    // a dependency for the package *.tgz itself
    dependencies: { [packageJson.name]: packFileDependency(packageJson) },
    devDependencies: { ...filteredUnitTestDependencies }
  }

  // Merge the three JSON objects.
  // Precedence increases to the right.
  // There is now no overlap between testPackageJson and generatedDependencies,
  // so all dependencies specified by testPackageJson will be in the result.
  return merge([defaultJson, testPackageJson, generatedDependencies])
}

/**
 * Determine if calculated versions from unit tests and package.json satisfy the
 * versions provided by testPackageJson.
 *
 * @param {Object} unitTestDependencies - contains all packageName:semver dependencies from generated packageJson
 * @param {Object} providedDependencies - contains all packageName:semver dependencies provided by testPackageJson
 * @returns {Object[]} - array of conflict data, lenth === 0 if no conflicts.
 * Each array element looks like this: { packageName, versions: [packageJsonVersion, testPackageJsonVersion] }
 */
const findSemverRangeConflicts = (unitTestDependencies, providedDependencies) => {
  const allKeys = Object.keys({ ...unitTestDependencies, ...providedDependencies }) // get all the unique keys
  const conflicts = allKeys.reduce((result, packageName) => {
    const calculatedVersion = unitTestDependencies[packageName]
    const providedVersion = providedDependencies[packageName]
    const isPotentialConflict = calculatedVersion !== undefined && providedVersion !== undefined
    if (isPotentialConflict) {
      const isCompatible = semver.intersects(calculatedVersion, providedVersion, { loose: true })
      if (!isCompatible) result.push({ packageName, versions: [calculatedVersion, providedVersion] })
    }
    return result
  },
  []) // <= conflicts starts out empty
  return conflicts
}

const checkSemverRangeConflicts = (packageJson, testPackageJson) => {
  const allTestPackageJsonDependencies = collectDependencies(testPackageJson)
  const allPackageJsonDependencies = collectDependencies(packageJson)
  const testPackageJsonConflicts = findSemverRangeConflicts(allTestPackageJsonDependencies, allPackageJsonDependencies)
  return testPackageJsonConflicts
}

/**
 * Generate a message describing the conflicts.
 *
 * @param {Object[]} conflicts - possibly empty array of conflict info objects.
 * Each array element looks like this: { packageName, versions: [packageJsonVersion, testPackageJsonVersion] }
 * @returns {String} - a message for the user
 */
const generateConflictMessage = (conflicts) => {
  let errorMessage
  if (conflicts.length > 0) {
    const conflictList = conflicts.map(o => o.packageName).join(', ')
    errorMessage = `Cannot create package.json. Provided testPackageJson has dependency conflicts for ${conflictList}.`
  }
  return errorMessage
}

/**
 * The actual Rollup plugin.
 */
export default (userOptions = {}) => {
  const options = {
    rootDir: undefined, // where to find packageJson if not provided
    packageJson: undefined, // information about package to be tested
    testPackageJson: {}, // package.json for test package to be enhanced by this plugin
    outputDir: undefined, // where to place generated packageJson
    jsonWriter: async (path, json) => fs.writeJSON(path, json, { spaces: 2 }), // option for unit tests
    checkSemverConflicts: false,
    ...userOptions // user options override defaults
  }
  let packageJson // options.packageJson or read from file. Assigned in renderStart, used in writeBundle
  return {
    name: 'create-test-package-json',

    // renderStart is used to read package.json. It would just make writeBundle longer otherwise.
    async renderStart (outputOptions, inputOptions) {
      try {
        // user may provide Promise for packageJson, so need await.
        packageJson = (await options.packageJson) || (await readPackageJson(options.rootDir))
      } catch (error) {
        this.error(`Problem loading package.json, check 'rootDir' option which is: ${options.rootDir}. Message: ${error.message}`)
      }
      return packageJson // Rollup won't use this, but the test will
    },

    // generateBundle() not needed because no need to generate package.json if not writing test files.
    // renderError() not needed for this plugin, a plain string is good enough for now.

    async writeBundle (outputOptions, bundle) {
      const testPackageJson = await options.testPackageJson // user may provide a Promise
      const conflicts = checkSemverRangeConflicts(packageJson, testPackageJson)
      if (options.checkSemverConflicts && conflicts.length > 0) {
        const errorMessage = generateConflictMessage(conflicts)
        this.error(errorMessage)
      } else {
        const unitTestDependencies = calculateUnitTestDependencies(packageJson, bundle)
        const generatedPackageJson = generatePackageJson(unitTestDependencies, packageJson, testPackageJson)
        const outputDir = options.outputDir || outputOptions.dir || dirname(outputOptions.file)
        const path = join(outputDir, 'package.json')
        await options.jsonWriter(path, generatedPackageJson)
      }
    }
  }
}
