# WDK CLI - AI Wallet

This is a multi-chain crypto wallet CLI for AI agents. Read `wdk-wallet/SKILL.md` for complete instructions on how to operate the wallet.

Key points:
- Use `--json` flag on data commands (`get`, `send`, `network`) for parseable output
- Wallet and config commands are interactive only — they do not support `--json`
- Always use `--dry-run --json` on send first to preview, then send with `--json` after user confirms in chat
- Amounts are in base units (wei/satoshis/lamports), never decimals
- Wallet must be unlocked by user before you can use it
- You cannot export seeds, or create/unlock wallets — these require interactive passphrase
