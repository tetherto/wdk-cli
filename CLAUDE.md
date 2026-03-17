# WDK CLI - AI Wallet

This is a multi-chain crypto wallet CLI for AI agents. Read `wdk-wallet/SKILL.md` for complete instructions on how to operate the wallet.

Key points:
- Use `--json` flag on all commands for parseable output
- Use `--dry-run` on send to preview transaction before confirming
- Use `--yes` on send after user confirms in chat
- Check `wdk policy show --json` before sending to respect spending limits
- Amounts are in base units (wei/satoshis/lamports), never decimals
- Wallet must be unlocked by user before you can use it
- You cannot modify policies, export seeds, or create wallets — these require interactive password
