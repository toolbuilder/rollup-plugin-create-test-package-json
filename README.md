# Rollup-Plugin-Create-Test-Package-Json

If you create a separate package to test your package's pack file, you'll need a `package.json` for it. This [Rollup](https://rollupjs.org/guide/en/) plugin generates that `package.json` file for you.

This plugin:

* Grabs the external dependencies for the unit tests as Rollup is generating them
* Uses the package versions specified in your `package.json` for the external dependencies
* Pulls peer dependencies from your `package.json`
* Merges the fields you specify in the plugin options into the generated `package.json` for the test
* Writes the `package.json` to Rollup's `output.dir` or to `dirname(output.file)` if `output.file` is specified.

This plugin is used by [@toolbuilder/rollup-config-pkgtest](https://github.com/toolbuilder/rollup-config-pkgtest), which builds and runs package tests in a temporary package.

Here's the context in which this plugin is suitable:

* Your unit tests are ES modules written using relative imports (e.g. `../src/some-file-from-your-module`)
* You want to reuse your unit tests as package tests, with your package as an external dependency
* You can use Rollup to convert unit tests to package tests with something like [rollup-plugin-relative-to-package](https://github.com/toolbuilder/rollup-plugin-relative-to-package)
* You don't want to manually maintain dependencies in the `package.json` file for your package tests

## Installation

Using npm:

```bash
npm install --save-dev rollup-plugin-create-test-package-json
```

## Use

The file [rollup.test.config.js](./rollup.test.config.js) in this package provides a complete working example that validates this package before release. If you have [pnpm](https://pnpm.js.org/) installed, you can run it like this:

```bash
# Requires pnpm
# Only tested on Linux
pnpm run check:packfile
```

You can use `npm` if you change `pnpm` to `npm` in [rollup.test.config.js](./rollup.test.config.js).

## Options

The plugin works without options. You will almost certainly want to use the `testPackageJson` option so you can specify a `scripts` section and perhaps a `devDependencies` section for your test runner.

### jsonWriter

* Type: `AsyncFunction`
* Default: `a function that pretty prints testPackageJson and writes it to file`

Use `jsonWriter` if you don't like how this plugin writes `package.json` by default. The parameters are:

* path - the full path name of the package.json file. For example: `/tmp/package-test-451/package.json`
* testPackageJson - the package.json Object that the plugin is writing

This is more or less what the default function looks like:

```javascript
import fs from 'fs-extra'
const defaultJsonWriter = async (path, json) => fs.writeJSON(path, json, { spaces: 2 })
```

### packageJson

* Type: `Object|Promise`
* Default: `the local package.json from disk`

This is the `package.json` of the **package you are testing**. If your package's `package.json` isn't suitable, you can use this option. If you set this option, the plugin will **not** read from the filesystem at all. This option exists primarily to support unit testing.

NOTE: You can pass a Promise that resolves to a `package.json` Object if you want. That way, you can do some async configuration work in your `rollup.config.js`

### rootDir

* Type: `String`
* Default: `process.cwd()`

This option tells the plugin where to look for the project's `package.json` if the `packageJson` option is not specified. This plugin will start looking for a `package.json` at `rootDir` and walk up the directory structure until it finds one, or fails at the root directly.

### outputDir

* Type: `String`
* Default: `output.dir` or `dirname(output.file)` from Rollup configuration

This option tells the plugin where to write the generated `package.json` file. When using `output.dir` with [rollup-plugin-multi-input](https://github.com/alfredosalzillo/rollup-plugin-multi-input), the default `outputDir` usually works. If you are placing a single file in a subdirectory, then you'll probably want to specify this option.

### testPackageJson

* Type: `Object|Promise`
* Default: `boilerplate package.json`

This plugin automatically grabs dependencies from the generated unit tests, and picks up the version specifiers from `package.json`. However, it doesn't know how to run your unit tests. Specify the parts of the `package.json` required to run the unit tests with this option. Anything you specify will override the values generated by the plugin.

NOTE: You can pass a Promise that resolves to an Object if you want. That way, you can do some async configuration work in your `rollup.config.js`

Here's an example. If you provide:

```javascript
  testPackageJson: {
    name: 'awesome-test-package' // copied over directly
    scripts: { test: 'tape -r esm test/**/*.js' }, // copied over directly
    customField: 'whatever', // copied over directly
    dependencies: {
      'lodash': '^5.0.0' // will override the value read from packageJson
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

This plugin will use '^5.0.0' instead of '^4.17.15' for `lodash` in the generated `package.json`. It would have used '^4.17.15' from the `packageJson` option by default.

## Contributing

So far, this plugin has only been tested on Linux. Contributions are very welcome. Please create a pull request or write up an issue. This package uses the [pnpm](https://pnpm.js.org/) package manager. Run `pnpm run check` to run all the unit tests and validation scripts. You can use `npm` if you change `pnpm` to `npm` in [rollup.test.config.js](./rollup.test.config.js).

## Issues

This project uses Github issues.

## License

MIT
