# @tetherto/wdk-cli

[![npm version](https://img.shields.io/npm/v/%40tetherto%2Fwdk-cli?style=flat-square)](https://www.npmjs.com/package/@tetherto/wdk-cli)
[![npm downloads](https://img.shields.io/npm/dw/%40tetherto%2Fwdk-cli?style=flat-square)](https://www.npmjs.com/package/@tetherto/wdk-cli)
[![license](https://img.shields.io/npm/l/%40tetherto%2Fwdk-cli?style=flat-square)](https://github.com/tetherto/wdk-cli/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-docs.wdk.tether.io-0A66C2?style=flat-square)](https://docs.wdk.tether.io/cli)

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.

A command-line wallet built with WDK. Manage named wallets, derive addresses, read balances and transactions, sign messages, send assets, find swap and bridge routes, and connect an MCP-compatible AI client to the same local wallet daemon.

**AI agents:** See [`SKILL.md`](./SKILL.md) for the operational guide, including workflows, error handling, and approval rules.

## About WDK

This tool is part of the [**WDK (Wallet Development Kit)**](https://docs.wdk.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control.

For detailed documentation about the complete WDK ecosystem, visit [docs.wdk.tether.io](https://docs.wdk.tether.io).

## Installation

Requires Node.js 22.18.0 or later and npm.

```bash
npm install -g @tetherto/wdk-cli@1.0.0-beta.5
wdk --version
```

The package installs `wdk`, `wdk-daemon`, and `wdk-mcp`; use `wdk` for the steps below.

## Quick Start

Create a dedicated, unfunded wallet and derive an Ethereum address:

> **Security:** Run these commands in a private terminal. Enter a strong, nonempty passphrase at the prompts. Wallet creation displays the generated seed phrase: record it offline and keep it out of screenshots, logs, source files, and agent conversations. Keep the passphrase and seed phrase separately.

```bash
# Create a wallet and enter its passphrase when prompted
wdk wallet create --name quickstart --words 12

# Unlock for five minutes
wdk wallet unlock --name quickstart --ttl 5

# Derive an address for this wallet
wdk get address --network ethereum --wallet quickstart

# End the session when finished
wdk wallet lock --name quickstart
```

The address command prints the wallet's Ethereum address. These steps do not transfer funds. The five-minute session starts at unlock; unlock again if it expires before the address command.

Any local process that can access the daemon as your operating-system user can use an unlocked wallet without entering its passphrase again. Review the [security model](https://docs.wdk.tether.io/cli/reference/security-model) before unlocking a funded wallet or connecting an AI client.

## Key Capabilities

- **Wallet Management**: Create and import BIP-39 wallets with per-wallet passphrases, encrypted seed files, and expiring unlock sessions
- **Account Data**: Derive addresses and read balances, transfer history, and normalized transaction receipts
- **Transfers and Message Signing**: Preview or send native and registered-token transfers, sign messages, and verify signatures
- **Swaps and Bridges**: Compare available protocol quotes and preview or execute same-network swaps and cross-network routes
- **Configuration and Modules**: Manage network and token entries, inspect module versions, and discover declared chain-specific methods
- **AI Integration**: Use CLI commands or the bundled MCP server to access the same local wallets
- **Fiat Ramps**: Generate MoonPay on-ramp and off-ramp URLs for supported assets

## Compatibility

- **Runtime**: Node.js 22.18.0 or later
- **Networks and Tokens**: Run `wdk network list` and `wdk token list` to inspect the current registries
- **Modules**: Run `wdk module list` to compare pinned and installed module versions
- **Providers**: Network operations, transfer history, swap and bridge routes, and fiat ramps depend on the applicable provider configuration and supported assets; see [Configuration](https://docs.wdk.tether.io/cli/configuration)
- **MCP Clients**: Automated setup supports Claude Desktop, Claude Code, and OpenClaw; other MCP-compatible clients can run `wdk-mcp` over stdio

## Documentation

| Topic | Description | Link |
|-------|-------------|------|
| Overview | CLI overview and command map | [WDK CLI Overview](https://docs.wdk.tether.io/cli) |
| Get Started | Wallet creation and first transaction walkthrough | [WDK CLI Get Started](https://docs.wdk.tether.io/cli/guides/get-started) |
| Configuration | Providers, defaults, paths, and environment variables | [WDK CLI Configuration](https://docs.wdk.tether.io/cli/configuration) |
| API Reference | Commands, parameters, options, and defaults | [WDK CLI API Reference](https://docs.wdk.tether.io/cli/api-reference) |
| MCP Server | Connect an MCP-compatible AI client | [WDK CLI MCP Guide](https://docs.wdk.tether.io/cli/guides/use-mcp-server) |
| Architecture | CLI, daemon, and MCP responsibilities | [WDK CLI Architecture](https://docs.wdk.tether.io/cli/reference/architecture) |
| Security | Wallet storage, session access, and recovery | [WDK CLI Security Model](https://docs.wdk.tether.io/cli/reference/security-model) |

## Community

Join the [WDK Discord](https://discord.gg/arYXDhHB2w) to connect with other developers.

## Support

For support, please [open an issue](https://github.com/tetherto/wdk-cli/issues) on GitHub or reach out via [email](mailto:wallet-info@tether.io).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
