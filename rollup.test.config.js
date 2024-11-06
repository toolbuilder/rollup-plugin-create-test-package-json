import createTestPackageJson from './src/plugin.js'
import createPackFile from '@toolbuilder/rollup-plugin-create-pack-file'
import runCommands, { shellCommand } from '@toolbuilder/rollup-plugin-commands'
import { globSync } from 'glob'
import { tmpdir } from 'os'
import path from 'node:path'
import { join } from 'path'
import { customAlphabet } from 'nanoid'
import { fileURLToPath } from 'node:url'

// This is recommended way of preserving directory structure and processing all files
// rather than using 'preserveModules: true', which involves tree-shaking and virtual files
const mapInputs = (glob) => Object.fromEntries(
  globSync(glob).map(file => [
    // Provide <dir structure>/<file basename> relative to package root, no file extension
    path.relative('.', file.slice(0, file.length - path.extname(file).length)),
    // Provide absolute filepath of input file
    fileURLToPath(new URL(file, import.meta.url))
  ])
)

// make a unique number so that each Rollup run produces a different temporary directory
const nanoid = customAlphabet('1234567890abcdef', 10)
const makeTempPath = (prefix) => join(tmpdir(), `${prefix}-${Date.now()}-${nanoid()}`)

// This is where the test package is created, and where testing takes place
const testPackageDir = makeTempPath('rollup-plugin-create-test-package-json')

export default [
  {
    // process all unit tests matching this glob
    // also specify that output goes in 'test' directory of testPackageDir
    // The multiInput plugin will process the glob
    input: mapInputs(['test/**/*test.js']),
    external: (id) => !(id.startsWith('.') || id.startsWith('/')),
    output: {
      format: 'es', // could be 'cjs' instead since we're testing a dual package
      dir: testPackageDir, // createTestPackageJson uses this as output directory
      preserveModules: false // Generate one unit test for each input unit test
    },
    plugins: [
      // Use this package to test this package...
      createTestPackageJson({ // Creates package.json for testPackageDir
        checkSemverConflicts: true,
        // Provide information that the plugin can't pick up for itself
        testPackageJson: {
          type: 'module', // this plugin can't guess the project type, so add it here
          scripts: {
            // pta is the test runner. It works like tape, but works with ES modules
            test: 'pta --reporter tap "test/*test.js"'
          },
          devDependencies: {
            // These are dependencies for the test runner,
            // Dependencies that don't appear in the unit tests need to be here.
            // Dependency versions in this section override any in package.json
            pta: '^1.2.0'
          }
        }
      }),
      // Create a pack file for this project...
      createPackFile({ // ...and move it to output.dir (i.e. testPackageDir)
        packCommand: 'pnpm pack'
      }),
      runCommands({
        commands: [
          // Install dependencies and run the unit tests
          // The -C prevents the test from picking up dependencies from this project
          shellCommand(`pnpm -C ${testPackageDir} install-test`)
        ]
      })
    ]
  }
]
