import generateJson from './src/plugin'
// preserveModules = true - could be an input option?

export default {
  input: 'src/plugin.js',
  preserveModules: true,
  output: {
    // file: 'test-bundle.js',
    format: 'es'
  },
  plugins: [
    generateJson() // Turns out that all defaults work here
  ]
}
