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
    dependencies.push(chunk.dynamicImports)
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
    dependencies: {
      ...buildTestDependencies(packageJson, collectDependencies(bundle)),
      [packageJson.name]: packFileDependency(packageJson), // for some reason, not picking this up from Rollup
      ...testPackageJson.dependencies // we've already ensured that this exists
    }
  }
}

export default (userOptions = {}) => {
  const options = {
    rootDir: undefined, // where to find packageJson if not provided
    packageJson: undefined, // information about package to be tested
    testPackageJson: {}, // package.json for test package to be enhanced by this plugin
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
    },

    async generateBundle (outputOptions, bundle, isWrite) {
      if (!isWrite) this.error('This package needs to write to disk, and Rollup is not writing to disk with this configuration')
      const testPackageJson = { dependencies: {}, ...options.testPackageJson } // ensure it has dependencies Object
      options.testPackageJson = createTestPackageJson(testPackageJson, options.packageJson, bundle)
    },

    // renderError not needed

    async writeBundle (outputOptions, chunks) {
      const path = join(outputOptions.dir, 'package.json')
      await fs.writeJSON(path, options.testPackageJson, { spaces: 2 })
    }
  }
}
