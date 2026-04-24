# WDK CLI - AI Wallet

This is a multi-chain crypto wallet CLI for AI agents. Read `wdk-wallet/SKILL.md` for complete instructions on how to operate the wallet.

Key points:
- Use `--json` flag on any command for parseable output
- Always use `--dry-run --json` on send first to preview, then send with `--json` after user confirms in chat
- Amounts are in base units (wei/satoshis/lamports), never decimals
- Wallet must be unlocked by user before you can use it
- Interactive wallet commands (create, import, unlock, export, delete) require passphrase — set `WDK_PASSPHRASE` env var for non-interactive use with `--json`
