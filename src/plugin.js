import cuid from 'cuid'
import { format } from 'date-fns'
import fs from 'fs-extra'
import { tmpdir } from 'os'
import { join } from 'path'
import pkgDir from 'pkg-dir'

const makeTempPath = (prefix = 'test-package') => {
  // formatISO emits colons for the time part, which can be problematic on command lines as NPM parameters
  const timePart = format(Date.now(), 'yyyy-MM-dd-kk-mm')
  return join(tmpdir(), `${prefix}-${timePart}-${cuid.slug()}`) // slug provides uniqueness in same minute
}

// Create the dependency version string for the pack file being tested
const packFileDependency = (packageJson) => {
  const name = packageJson.name.replace('@', '').replace('/', '-')
  const version = packageJson.version
  return `file:${name}-${version}.tgz`
}

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
  For each dependency package name, copy package version information from packageJson
  to build dependencies field for testPackageJson.

  testDependencies is just an array of external package names
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
    name: 'generate-test-package',

    outputOptions (outputOptions) {
      if (outputOptions.dir == null) {
        const tempPath = makeTempPath()
        console.log(tempPath)
        return { ...outputOptions, dir: tempPath }
      }
    },

    async renderStart (outputOptions, inputOptions) {
      // Want to create this outputOptions.dir ASAP so that other code can write to it
      await fs.ensureDir(outputOptions.dir)
      options.packageJson = options.packageJson || await readPackageJson(options.rootDir)
      options.testPackageJson = {
        name: 'packageTest',
        version: '1.0.0',
        description: `Generated package test for ${options.packageJson.name}`,
        main: 'index.js',
        scripts: {},
        author: 'rollup-plugin-test-package-json',
        dependencies: {},
        devDependencies: {},
        ...(options.testPackageJson || {})
      }
    },

    async generateBundle (outputOptions, bundle) {
      console.log('IN generateBundle')
      const testDir = outputOptions.dir
      const packageJson = options.packageJson
      const testPackageJson = options.testPackageJson
      testPackageJson.dependencies = {
        ...buildTestDependencies(packageJson, collectDependencies(bundle)),
        ...testPackageJson.dependencies
      }
      await fs.writeJSON(join(testDir, 'package.json'), testPackageJson, { spaces: 2 })
    },

    async renderError () { /* No cleanup required */ },

    async writeBundle (outputOptions, chunks) {
      console.log('IN writeBundle!')
      /*
        Hmmm, renderStart documentation says to use generateBundle and renderError to know when
        output is complete.
        However, the writeBundle docs seem to indicate that if bundle.write is used, this is the
        method called when output is complete. Arrgh.
        Programmatic rollup use looks like this to just write files:
          const bundle = await rollup(inputOptions)
          await bundle.write(outputOptions)
      */
    }
  }
}
