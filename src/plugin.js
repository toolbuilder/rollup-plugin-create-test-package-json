import fs from 'fs-extra'
import { join } from 'path'
import pkgDir from 'pkg-dir'

// Create the dependency version string for the pack file being tested
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
  Merge dependency version information from packageJson with dependency ids
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
      options.packageJson = options.packageJson || await readPackageJson(options.rootDir)
      options.testPackageJson = {
        name: `${options.packageJson.name}-package-test`,
        version: '1.0.0',
        description: `Generated package test for ${options.packageJson.name}`,
        main: 'index.js',
        scripts: {},
        author: 'rollup-plugin-test-package-json',
        dependencies: {},
        devDependencies: {},
        ...options.testPackageJson
      }
    },

    async generateBundle (outputOptions, bundle, isWrite) {
      if (!isWrite) this.error('create-test-package-json only works when writing to disk')
      const packageJson = options.packageJson
      const testPackageJson = options.testPackageJson
      testPackageJson.dependencies = {
        ...buildTestDependencies(packageJson, collectDependencies(bundle)),
        [packageJson.name]: packFileDependency(packageJson), // for some reason, not picking this up from Rollup
        ...testPackageJson.dependencies
      }
    },

    async renderError () { /* Nothing to do */ },

    async writeBundle (outputOptions, chunks) {
      const testPackageJson = options.testPackageJson
      const testDir = outputOptions.dir
      await fs.writeJSON(join(testDir, 'package.json'), testPackageJson, { spaces: 2 })
    }
  }
}
