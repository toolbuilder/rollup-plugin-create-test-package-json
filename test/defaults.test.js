import { chainable } from 'iterablefu'
import { test } from 'zora'
import { exercisePlugin, fakePackageJson } from './common.js'

/*
  This module tests default values that the plugin places in the generated package.json.
  It also checks that values picked up from options.packageJson are used if provided.
  The tests are generated since there are a number of default values.

  Other options, and their default behavior are tested elsewhere.

  * options.packageJson is tested in file-access.test.js
  * options.rootDir is tested in file-access.test.js
  * options.outputDir is tested in file-access.test.js
  * options.testPackageJson is tested in plugin.test.js
  * options.checkSemverConflicts is tested in plugin.test.js
  * options.jsonWriter is used for most of the tests
*/

// These are the expected default package.json values from the plugin.
const defaultFieldValues = {
  name: `${fakePackageJson.name}-package-test`,
  version: '1.0.0',
  description: `Generated package test for ${fakePackageJson.name}`,
  main: 'index.js',
  scripts: {},
  author: 'rollup-plugin-test-package-json'
}

// These differ from the default values, and will be used as test input.
const specifiedFieldValues = {
  name: 'unit-test-package-test',
  version: '42.0.1-alpha00',
  description: 'unit-test-values-for-testing',
  main: 'mighty-plugin.mjs',
  scripts: { test: 'tape -r esm src/**/*.js' },
  author: 'some non-default author'
}

// zipAll does this: For each fieldName in defaultFieldValues,
// create an Array with these values:
// [fieldName, defaultFieldValues[fieldName], specifiedFieldValues[fieldName]]
const testCases = chainable
  .zipAll(
    Object.keys(defaultFieldValues), // field names
    Object.values(defaultFieldValues), // default values
    Object.values(specifiedFieldValues) // test values
  )
  .toArray()

// Run the test cases
testCases.forEach(([fieldName, defaultValue, specifiedValue]) => {
  test(`when ${fieldName} is unspecified in testPackageJson, default value is provided`, async assert => {
    const { writer } = await exercisePlugin(fakePackageJson, undefined)
    const actual = writer.packageJson[fieldName]
    assert.deepEqual(actual, defaultValue, `default ${fieldName} provided correctly`)
  })

  test(`when ${fieldName} is specified in testPackageJson, it is returned unchanged`, async assert => {
    const testPackageJson = { [fieldName]: specifiedValue }
    const { writer } = await exercisePlugin(fakePackageJson, testPackageJson)
    const actual = writer.packageJson[fieldName]
    assert.deepEqual(actual, specifiedValue, `specified ${fieldName} provided correctly`)
  })
})
