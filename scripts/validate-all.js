import { runModCommand } from './lib/run-mod-command.js'

runModCommand({
  subcommand: 'validate',
  bannerPrefix: 'Validating',
  stepPrefix: 'Validating',
  successMessage: 'All mod manifests and hooks validated successfully!',
  failureMessage: 'Some mod validations failed.',
})
