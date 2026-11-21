import { runModCommand } from './lib/run-mod-command.js'

runModCommand({
  subcommand: 'test',
  bannerPrefix: 'Running test suites for',
  stepPrefix: 'Testing',
  successMessage: 'All mod test suites passed successfully!',
  failureMessage: 'Some mod test suites failed.',
})
