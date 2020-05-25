# Rollup-Plugin-Create-Test-Package-Json

If you create a separate package to test your package's pack file, you'll need a `package.json` for it. This [Rollup](https://rollupjs.org/guide/en/) plugin creates that `package.json` file for you. It is intended to be used in conjunction with [rollup-plugin-relative-to-package](https://github.com/toolbuilder/rollup-plugin-relative-to-package) which converts your unit tests to package tests.

Here's the context in which this plugin is suitable:

* Your unit tests are ES modules written using relative imports (e.g. '../src/some-file-from-your-module')
* You want to reuse your unit tests as package tests, with your package as an external dependency
* You can use Rollup to convert unit tests to package tests with something like `rollup-plugin-relative-to-package`
* You don't want to maintain dependencies in the `package.json` file for your package tests

This plugin makes the `package.json` for your test package while `rollup-plugin-relative-to-package` is converting unit tests to package tests. For example `rollup-plugin-relative-to-package` will convert the unit test:

```javascript
import YourPackage from '../src/your-package-module'
import { internalFunction } from '../src/inside-your-package'
import { test } from 'zora'
import { chainable } from 'iterablefu'
/* Unit test code goes here */
```

To this:

```javascript
import YourPackage from 'your-package-name'
import { internalFunction } from 'your-package-name/src/inside-your-package'
import { test } from 'zora'
import { chainable } from 'iterablefu'
/* Unit test code goes here */
```

While Rollup is working, this plugin, `rollup-plugin-create-test-package-json`, will pick up the unit test dependencies `your-package-name`, `zora`, and `iterablefu`. It will put those dependencies into the test package's `package.json` using version numbers from your package's `package.json`. The dependency on `your-package-name` is for a pack file by default.

Depending on your options, the generated `package.json` for your test package (**not** your package) would look something like this:

```json
{
  "name": "your-package-name-package-test",
  "version": "1.0.0",
  "description": "Generated package test for your-package-name",
  "main": "index.js",
  "scripts": {
    "test": "tape -r esm test/*_test.js"
  },
  "author": "rollup-plugin-test-package-json",
  "dependencies": {
    "your-package-name": "file:your-package-name-0.1.0-alpha05.tgz",
    "zora": "^3.1.8",
    "iterablefu": "^0.4.1",
  },
  "devDependencies": {
    "esm": "^3.2.25",
    "tape": "^4.13.2"
  }
}
```

## Installation

Using npm:

```bash
npm install --save-dev rollup-plugin-create-test-package-json
```

## Use

Here's a complete example showing how to use this plugin with other plugins to produce package tests **and** a `package.json` file.

```javascript
import createTestPackageJson from 'rollup-plugin-create-test-package-json'
import relativeToPackage from 'rollup-plugin-relative-to-package'
import multiInput from 'rollup-plugin-multi-input'

export default [
  {
    // Each unit test is a separate entry point.
    // Using multiInput to handle an input glob
    // We're using Rollup on the unit tests - not the package source!!
    input: ['test/**/*_test.js'],
    // Set this if you want each unit test output separately
    preserveModules: true,
    output: {
      // The test runner is using 'esm' to load ES modules,
      // so conversion to cjs is NOT required
      format: 'es',
      // This plugin will put package.json here
      // and Rollup will put the transformed unit tests here
      dir: 'tempdir/somewhere/for/test/package'

      // The plugin will use 'file' if you provide that instead.
      // file: 'tempdir/a/single/test/file.js'
    },
    plugins: [
      multiInput(), // Handles the input glob above
      // relativeToPackage converts unit tests to package tests
      relativeToPackage({
        modulePaths: 'src/**/*.js' // The package source is here
      }),
      // createTestPackageJson creates the package.json file
      createTestPackageJson({
        // Override defaults by providing fields you
        // want in your test package.json file.
        testPackageJson: {
          // Specify this so 'npm test' works
          scripts: {
            test: 'tape -r esm test/*_test.js'
          },
          // dependencies for the test runner only
          devDependencies: {
            esm: '^3.2.25',
            tape: '^4.13.2'
          }
        }
      })
    ]
  }
]
```

## Options

The plugin works without options. You will almost certainly want to use the `testPackageJson` option so you can specify a `scripts` section and perhaps a `devDependencies` section for your test runner.

### jsonWriter

* Type: `AsyncFunction`
* Default: `a function that pretty prints testPackageJson`

Use `jsonWriter` if you don't like how this plugin writes `package.json` by default. The parameters are:

* path - the full path name of the package.json file. For example: `/tmp/package-test-451/package.json`
* testPackageJson - the package.json Object that the plugin is writing

This more or less what the default function looks like:

```javascript
import fs from 'fs-extra'
const defaultJsonWriter = async (path, json) => fs.writeJSON(path, json, { spaces: 2 })
```

### packageJson

* Type: `Object|Promise`
* Default: `the local package.json from disk`

This is the `package.json` of the **package you are testing**. If your package's `package.json` isn't suitable, you can use this option. If you set this option, the plugin will **not** read from the filesystem at all.

You can pass a Promise that resolves to a `package.json` file if you want. That way, you can do some async configuration work in your `rollup.config.js`

### rootDir

* Type: `String`
* Default: `process.cwd()`

This option tells the plugin where to look for the project's `package.json` if the `packageJson` option is not specified. This plugin will start looking for a `package.json` at `rootDir` and walk up the directory structure until it finds one, or fails at the root directly.

### testPackageJson

* Type: `Object|Promise`
* Default: `boilerplate package.json`

Specify any fields you want to appear in the generated `package.json` file. Anything you specify will override the plugin's values. This plugin will generate the dependencies section and merge in the dependencies section you provide on top of the generated one. The generated dependency versions are read from the `packageJson` option.

You can pass a Promise that resolves to an Object if you want. That way, you can do some async configuration work in your `rollup.config.js`

Here's an example. If you provide:

```javascript
  testPackageJson: {
    name: 'awesome-test-package' // copied over directly
    scripts: { test: 'tape -r esm test/**/*.js' }, // copied over directly
    customField: 'whatever', // copied over directly
    dependencies: {
      'lodash': '^5.0.0' // will override value read from packageJson
    }
    devDependencies: { // devDependencies copied over directly
      "esm": "^3.2.25",
      "tape": "^4.13.2"
    }
  }
```

But your package's `package.json` says this:

```json
  "depencencies": {
    "lodash": "^4.17.15"
  }
```

This plugin will use '^5.0.0' instead of '^4.17.15' in the generated `package.json`. It would have used '^4.17.15' from the `packageJson` option by default.
