# @moltrust/openclaw

[![MolTrust Verified](https://api.moltrust.ch/badge/did:moltrust:d34ed796a4dc4698)](https://moltrust.ch)
[![npm](https://img.shields.io/npm/v/@moltrust/openclaw)](https://npmjs.com/package/@moltrust/openclaw)

> W3C DID trust verification plugin for [OpenClaw](https://openclaw.ai)

MolTrust adds cryptographic agent identity verification to OpenClaw — so your agent knows who it's talking to before it acts.

## Install

```bash
openclaw plugins install @moltrust/openclaw
```

Then restart your Gateway.

## What it does

| Feature | Details |
|---------|---------|
| **DID Verification** | Verify any agent's W3C DID identity on-chain (Base L2) |
| **Trust Scores** | 0–100 reputation score combining on-chain signals + VC checks |
| **Sybil Detection** | Cluster analysis + funding trace to detect fake agents |
| **VC Check** | Verify Verifiable Credentials (skill, salesguard, travel, shopping) |
| **Slash Commands** | `/trust` and `/trustscore` in any channel |
| **CLI** | `openclaw moltrust verify/score/status` |

## Configuration

```json
{
  "plugins": {
    "entries": {
      "moltrust": {
        "enabled": true,
        "config": {
          "apiKey": "mt_live_...",
          "minTrustScore": 40,
          "verifyOnStart": true,
          "agentDid": "did:moltrust:your-agent-did"
        }
      }
    }
  }
}
```

Get an API key at [api.moltrust.ch/auth/signup](https://api.moltrust.ch/auth/signup).  
Free tier: wallet score checks, no key needed.

## Agent Tools

### `moltrust_verify`

Verify an agent's DID before trusting it with tasks or payments.

```
moltrust_verify(did="did:moltrust:abc123")
```

Returns: verified status, credential details, trust score.

### `moltrust_trust_score`

Get a 0–100 trust score by DID or EVM wallet address.

```
moltrust_trust_score(identifier="0x3802...")
moltrust_trust_score(identifier="did:moltrust:abc123")
```

## Slash Commands

```
/trust did:moltrust:abc123      — verify a DID
/trustscore did:moltrust:abc123 — get trust score
/trustscore 0x3802...           — score by wallet (free, no key)
```

## CLI

```bash
openclaw moltrust status           # check API connectivity
openclaw moltrust verify <did>     # verify a DID
openclaw moltrust score <id>       # get trust score
```

## Why trust verification matters

OpenClaw agents can hold wallets, execute payments, and install skills autonomously.  
341 malicious skills were found on ClawHub in early 2026 — credential stealers, data exfiltration, prompt injection. VirusTotal catches known signatures, but not impersonation, sybil clusters, or slow-burn trust manipulation.

MolTrust is the cryptographic trust layer OpenClaw is missing: W3C DID-based identity, on-chain anchoring on Base, and Verifiable Credentials that can't be faked.

## Links

- 🔍 [Wallet Trust Profile](https://moltrust.ch/wallet/0x380238347e58435f40B4da1F1A045A271D5838F5) — shadow score for any wallet

- 🌐 [moltrust.ch](https://moltrust.ch)
- 📖 [KYA Whitepaper](https://moltrust.ch/MolTrust_KYA_Whitepaper.pdf)
- 🔧 [MCP Server](https://api.moltrust.ch/mcp) — 48 tools
- 🐦 [@moltrust](https://x.com/moltrust)
- 📦 [npm](https://npmjs.com/package/@moltrust/openclaw)

## License

MIT © [CryptoKRI GmbH](https://moltrust.ch)
