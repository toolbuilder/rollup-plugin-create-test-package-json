import createTestPackageJson from './src/plugin.js'
import multiInput from 'rollup-plugin-multi-input'
import createPackFile from '@toolbuilder/rollup-plugin-create-pack-file'
import runCommands, { shellCommand } from '@toolbuilder/rollup-plugin-commands'
import { tmpdir } from 'os'
import { join } from 'path'
import { customAlphabet } from 'nanoid'

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
    input: ['test/**/*test.js'],
    preserveModules: true, // Generate one unit test for each input unit test
    output: {
      format: 'es', // could be 'cjs' instead since we're testing a dual package
      dir: testPackageDir // createTestPackageJson uses this as output directory
    },
    plugins: [
      multiInput(), // Handles the input glob above
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
