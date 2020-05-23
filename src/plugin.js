import fs from 'fs-extra'
import { join } from 'path'
import pkgDir from 'pkg-dir'

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
  Merge dependency version information from packageJson with
  dependency ids from Rollup bundle generation.
  Parameter testDependencies is just an array of external package names
*/
const buildTestDependencies = (packageJson, testDependencies) => {
  const allPackageDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    [packageJson.name]: packFileDependency(packageJson)
  }
  const entries = testDependencies.map(dependency => [dependency, allPackageDependencies[dependency]])
  return Object.fromEntries(entries)
}

const readPackageJson = async (rootDir) => {
  const path = await pkgDir(rootDir)
  return fs.readJSON(join(path, 'package.json'))
}

const createTestPackageJson = (testPackageJson, packageJson, bundle) => {
  return {
    name: `${packageJson.name}-package-test`,
    version: '1.0.0',
    description: `Generated package test for ${packageJson.name}`,
    main: 'index.js',
    scripts: {},
    author: 'rollup-plugin-test-package-json',
    devDependencies: {},
    ...testPackageJson,
    // Up to this point, all testPackageJson fields overwrite defaults.
    // Now merge testPackageJson provided dependencies with calculated dependencies.
    // testPackageJson still overwrites any calculated dependencies
    dependencies: {
      ...buildTestDependencies(packageJson, collectDependencies(bundle)),
      [packageJson.name]: packFileDependency(packageJson), // a dependency for the package itself
      ...testPackageJson.dependencies // we've already ensured that this exists
    }
  }
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
        options.packageJson = options.packageJson || await readPackageJson(options.rootDir)
      } catch (error) {
        this.error(`Problem loading package.json, check 'rootDir' option which is: ${options.rootDir}. Message ${error.message}`)
      }
      return options.packageJson // Rollup won't use this, but the test will
    },

    // generateBundle not needed because no need to generate package.json if not writing test files
    // renderError not needed

    async writeBundle (outputOptions, bundle) {
      const testPackageJson = { dependencies: {}, ...options.testPackageJson } // ensure it has dependencies Object
      options.testPackageJson = createTestPackageJson(testPackageJson, options.packageJson, bundle)
      const path = join(outputOptions.dir, 'package.json')
      await options.jsonWriter(path, options.testPackageJson)
    }
  }
}
