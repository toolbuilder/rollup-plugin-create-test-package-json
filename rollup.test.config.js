import createTestPackageJson from './src/plugin'
import multiInput from 'rollup-plugin-multi-input'
import relativeToPackage from 'rollup-plugin-relative-to-package'
import createPackFile from '@toolbuilder/rollup-plugin-create-pack-file'
import runCommands, { shellCommand } from '@toolbuilder/rollup-plugin-commands'
import { tmpdir } from 'os'
import { join } from 'path'

// This is where the test package is created
const testPackageDir = join(tmpdir(), `${Date.now()}`)

export default [
  {
    // process all unit tests, and specify output in 'test' directory of testPackageDir
    input: ['test/**/*test.js'],
    preserveModules: true, // Generate one unit test for each input unit test
    output: {
      format: 'es',
      dir: testPackageDir // createTestPackageJson uses this as output directory
    },
    plugins: [
      multiInput(), // Handles the input glob above
      relativeToPackage({ // Converts relative imports to package imports
        modulePaths: 'src/**/*.js'
      }),
      // This package: rollup-plugin-create-test-package-json...
      createTestPackageJson({ // Creates package.json for testPackageDir
        // Provide information that plugin can't pick up for itself
        testPackageJson: {
          scripts: {
            test: 'tape -r esm test/**/*test.js | tap-nirvana'
          },
          // dependencies are populated automatically
          devDependencies: {
            // These are dependencies for the test runner,
            // and don't appear in the unit tests.
            esm: '^3.2.25',
            tape: '^5.0.1',
            'tap-nirvana': '^1.1.0'
          }
        }
      }),
      createPackFile({ // ...and move it to output.dir (i.e. testPackageDir)
        packCommand: 'pnpm pack'
      }),
      runCommands({
        commands: [
          // Install dependencies and run the unit test
          shellCommand(`pnpm -C ${testPackageDir} install-test`)
        ]
      })
    ]
  }
]
