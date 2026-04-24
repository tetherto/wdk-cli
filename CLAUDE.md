# WDK CLI - AI Wallet

This is a multi-chain crypto wallet CLI for AI agents. Read `SKILL.md` for complete instructions on how to operate the wallet.

Key points:
- Use `--json` flag on any command for parseable output
- Always use `--dry-run --json` on send first to preview, then send with `--json` after user confirms in chat
- Amounts are in base units (wei/satoshis/lamports), never decimals
- Wallet must be unlocked by user before you can use it
- You cannot create, import, unlock, export, or delete wallets — these require interactive passphrase input. Ask the user to do it.
