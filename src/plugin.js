import fs from 'fs-extra'
import { dirname, join } from 'path'
import pkgDir from 'pkg-dir'
import merge from 'plain-object-merge'

// Create the dependency version string for the pack file being tested.
// This is how npm will name the pack file when 'npm pack' is called.
const packFileDependency = (packageJson) => {
  const name = packageJson.name.replace('@', '').replace('/', '-')
  const version = packageJson.version
  return `file:${name}-${version}.tgz`
}

// Walk through Rollup bundle and collect dependency ids
const collectDependencies = (bundle) => {
  const dependencies = []
  for (const chunk of Object.values(bundle)) {
    if (chunk.type === 'asset') continue
    dependencies.push(chunk.imports)
    // dependencies.push(chunk.dynamicImports) // TODO not sure here
  }
  return dependencies.flat() // return Array of external package names
}

/*
  Rollup just provides external dependency ids (e.g. 'lodash'), since
  these dependencies must be in this package's 'package.json' file,
  this function picks up the semantic versions from there.

  Parameter testDependencies is just an array of external package names
*/
const buildTestDependencies = (packageJson, testDependencies) => {
  const allPackageDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  }
  const entries = testDependencies
    .map(dependency => [dependency, allPackageDependencies[dependency]])
  return Object.fromEntries(entries)
}

const readPackageJson = async (rootDir) => {
  const path = await pkgDir(rootDir)
  return fs.readJSON(join(path, 'package.json'))
}

const createTestPackageJson = (testPackageJson, packageJson, bundle) => {
  const generatedJson = {
    name: `${packageJson.name}-package-test`,
    version: '1.0.0',
    description: `Generated package test for ${packageJson.name}`,
    main: 'index.js',
    scripts: {},
    author: 'rollup-plugin-test-package-json',
    devDependencies: {},
    dependencies: {
      ...buildTestDependencies(packageJson, collectDependencies(bundle)),
      [packageJson.name]: packFileDependency(packageJson), // a dependency for the package *.tgz itself,
      ...(packageJson.peerDependencies || {}) // Pickup peer dependencies since Rollup doesn't see them.
    }
  }
  return merge([generatedJson, testPackageJson]) // testPackageJson takes precedence
}

export default (userOptions = {}) => {
  const options = {
    rootDir: undefined, // where to find packageJson if not provided
    packageJson: undefined, // information about package to be tested
    testPackageJson: {}, // package.json for test package to be enhanced by this plugin
    jsonWriter: async (path, json) => fs.writeJSON(path, json, { spaces: 2 }), // option for unit tests
    ...userOptions
  }
  return {
    name: 'create-test-package-json',

    async renderStart (outputOptions, inputOptions) {
      try {
        options.packageJson = await (options.packageJson || readPackageJson(options.rootDir))
      } catch (error) {
        this.error(`Problem loading package.json, check 'rootDir' option which is: ${options.rootDir}. Message ${error.message}`)
      }
      return options.packageJson // Rollup won't use this, but the test will
    },

    // generateBundle not needed because no need to generate package.json if not writing test files
    // renderError not needed

    async writeBundle (outputOptions, bundle) {
      const testPackageJson = await options.testPackageJson
      options.testPackageJson = createTestPackageJson(testPackageJson, options.packageJson, bundle)
      const outputDir = outputOptions.dir || dirname(outputOptions.file)
      const path = join(outputDir, 'package.json')
      await options.jsonWriter(path, options.testPackageJson)
    }
  }
}
