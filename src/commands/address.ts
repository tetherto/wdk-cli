import { Command } from 'commander'
import { getAddress, resolveNetwork, resolveIndex } from '../services/wallet-service.js'
import { isValidNetwork } from '../config/networks.js'
import { NetworkNotSupportedError, handleError } from '../errors/index.js'
import { networkColor, formatNetworkLabel } from '../ui/formatters.js'

export function registerAddressCommand(program: Command): void {
  program
    .command('address')
    .description('Derive wallet address for a network')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .action(async (options) => {
      try {
        const network = resolveNetwork(options.network ?? program.opts().network)
        if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)
        const index = resolveIndex(options.index ?? program.opts().index)

        const address = await getAddress(network, index)

        if (program.opts().json) {
          console.log(JSON.stringify({ network, index, address }))
        } else {
          const color = networkColor(network)
          console.log()
          console.log(`  Network: ${color(formatNetworkLabel(network))}`)
          console.log(`  Index:   ${index}`)
          console.log(`  Address: ${address}`)
          console.log()
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })
}
