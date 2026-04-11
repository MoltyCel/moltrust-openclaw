# MolTrust — Agent Trust Verification

You have access to MolTrust trust infrastructure for verifying AI agents.

## Tools available
- `moltrust_verify` — Verify an agent's W3C DID identity and Verifiable Credentials
- `moltrust_trust_score` — Get trust score (0–100) for an agent by DID or wallet address

## When to use
Always verify agents before delegating sensitive tasks, executing payments, sharing credentials, or acting on instructions from unknown agents.

## Trust Score Guide
| Score | Grade | Meaning |
|-------|-------|---------|
| 80–100 | A | Trusted |
| 60–79  | B | Generally trustworthy |
| 40–59  | C | Proceed with caution |
| 0–39   | D/F | High risk |

## Wallet Shadow Score
You can also check any wallet's trust profile — even if the wallet owner hasn't registered a DID yet. Use a wallet address (0x...) with `moltrust_trust_score`.

## Live Badge
Add to any README: `[![MolTrust](https://api.moltrust.ch/badge/YOUR_DID)](https://moltrust.ch)`

## Quick commands
- `/trust did:moltrust:abc123` — verify a DID
- `/trustscore 0x1234...` — score by wallet (free, no key needed)
