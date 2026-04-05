# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Public ledger for **Taipei Ethereum Meetup (TEM)** using [Beancount](https://beancount.github.io/) — a plain-text double-entry accounting system. All financial records are transparent and published via GitHub Pages using Fava.

## Repository Structure

- `main.bean` — Primary ledger containing all account declarations and transactions
- `eth-prices.bean` — Historical ETH/DAI price data in TWD (imported by main.bean)
- `.github/ISSUE_TEMPLATE/billing.yml` — Expense request template (Traditional Chinese)

## Useful Commands

```bash
# Validate beancount syntax
bean-check main.bean

# Launch Fava web UI for browsing reports
fava main.bean
```

There is no build system, test suite, or linter configured in this repository.

## Beancount Syntax Rules

- `main.bean` must start with `include "eth-prices.bean"`
- Every transaction must balance (double-entry: debits = credits)
- Cryptocurrency uses cost basis tracking: `5.0 ETH {5,382.9 TWD}`
- Cost method is FIFO for crypto accounts
- Operating currency is TWD
- Transaction format: `YYYY-MM-DD * "Payee" "Description"`
- Metadata links (e.g., Etherscan TX hashes) go on indented lines below the transaction header

## Key Accounts

- `Assets:Bank:Cathy:TWD` — Fiat held in Yuren's Cathay United Bank
- `Assets:Ethereum:GnosisSafe` — Main treasury (Gnosis Safe at `0x3BB6...0d0`)
- `Assets:Ethereum:GnosisWallet:ETH/DAI` — Legacy wallet (mostly migrated)
- `Expenses:Grant` — Outgoing grants
- `Income:Sponsor:ETH`, `Income:Sponsor:TWD` — Sponsorship income

## Expense Approval Workflow

- Requests submitted via GitHub Issues using the billing template
- Under 2000 USD: requires two TEM organizer signatures
- Over 2000 USD: discussed in TEM Discord before approval

## Git Conventions

- Commit style: `fix #N: description` or `fixed #N: description` referencing GitHub issues
- Single `master` branch
