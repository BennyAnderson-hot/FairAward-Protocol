# FairAward Protocol

## Overview

FairAward Protocol is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses real-world problems in award and tender processes, such as government contracts, grant allocations, scholarships, or prize distributions, where lack of transparency often leads to corruption, favoritism, and unfair outcomes. By leveraging sealed bids on the blockchain, the protocol ensures that bids are committed privately (via hashes) during a submission phase, revealed publicly in a reveal phase, and evaluated transparently based on predefined criteria. This prevents bid tampering, collusion, or insider advantages, promoting fairness and trust in high-stakes award systems.

Key features:
- **Sealed Bids**: Bidders submit hashed commitments to prevent early revelation.
- **Phased Process**: Separate phases for submission, reveal, and evaluation to enforce timing.
- **On-Chain Transparency**: All actions are verifiable on the blockchain.
- **Decentralized Evaluation**: Automated scoring or oracle-integrated judging.
- **Stake and Penalties**: Bidders stake tokens to discourage malicious behavior.
- **Real-World Impact**: Solves issues in public procurement (e.g., reducing bribery in tenders), academic grants (fair selection), and NGO awards (transparent donor fund distribution).

The protocol involves 7 smart contracts, each handling a modular aspect of the system. Contracts are designed to be composable, secure, and efficient, with traits for interoperability.

## Prerequisites

- Stacks Blockchain (Testnet or Mainnet).
- Clarity development environment (e.g., Clarinet for local testing).
- STX tokens for deployment and interactions.
- Basic knowledge of Clarity syntax.

## Architecture

The system flow:
1. Admin creates a new award/tender via the Tender contract.
2. Users register via Registry.
3. Bidders submit hashed bids via BidCommitment during the submission phase.
4. In the reveal phase, bidders reveal their bids via BidReveal.
5. Evaluation contract scores bids automatically (e.g., lowest bid wins for tenders, or highest score for grants).
6. Award contract distributes prizes (e.g., transfers tokens or NFTs).
7. Token contract handles staking and payments.

Contracts interact via traits to ensure security (e.g., only registered users can bid).

## Deployment

Use Clarinet to deploy:
```
clarinet contract deploy registry.clar
clarinet contract deploy token.clar
# ... deploy others similarly
```

## Smart Contracts

Below are the 7 smart contracts with their Clarity code. Each is in a separate file (e.g., `registry.clar`). Contracts use public functions for key actions and read-only for queries.

### 1. Registry.clar (User Registration)

This contract handles user registration, mapping principals to profiles. Ensures only registered users can participate.

```clarity
(define-map users principal { name: (string-ascii 50), registered-at: uint })

(define-trait registry-trait
  (
    (register (principal (string-ascii 50)) (response bool uint))
    (is-registered (principal) (response bool uint))
  ))

(define-public (register (user principal) (name (string-ascii 50)))
  (if (is-none (map-get? users user))
    (begin
      (map-set users user { name: name, registered-at: block-height })
      (ok true))
    (err u100)))  ;; Error: Already registered

(define-read-only (is-registered (user principal))
  (ok (is-some (map-get? users user))))
```

### 2. Token.clar (Fungible Token for Stakes and Awards)

A simple FT for staking during bids and distributing awards. Based on SIP-010 standard.

```clarity
(define-fungible-token award-token u100000000)

(define-trait token-trait
  (
    (transfer (principal principal uint) (response bool uint))
    (get-balance (principal) (response uint uint))
  ))

(define-public (transfer (sender principal) (recipient principal) (amount uint))
  (ft-transfer? award-token amount sender recipient))

(define-public (mint (recipient principal) (amount uint))
  (ft-mint? award-token amount recipient))

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance award-token account)))
```

### 3. Tender.clar (Award/Tender Creation)

Admins create new awards with phases (submission start/end, reveal start/end).

```clarity
(define-map tenders uint { admin: principal, description: (string-ascii 256), submission-start: uint, submission-end: uint, reveal-start: uint, reveal-end: uint, status: (string-ascii 20) })
(define-data-var tender-counter uint u0)

(define-trait tender-trait
  (
    (create-tender (principal (string-ascii 256) uint uint uint uint) (response uint uint))
    (get-tender (uint) (response {admin: principal, description: (string-ascii 256), submission-start: uint, submission-end: uint, reveal-start: uint, reveal-end: uint, status: (string-ascii 20)} uint))
  ))

(define-public (create-tender (admin principal) (description (string-ascii 256)) (sub-start uint) (sub-end uint) (rev-start uint) (rev-end uint))
  (let ((id (var-get tender-counter)))
    (map-set tenders id { admin: admin, description: description, submission-start: sub-start, submission-end: sub-end, reveal-start: rev-start, reveal-end: rev-end, status: "open" })
    (var-set tender-counter (+ id u1))
    (ok id)))

(define-read-only (get-tender (id uint))
  (match (map-get? tenders id)
    some-tender (ok some-tender)
    none (err u200)))  ;; Error: Tender not found
```

### 4. BidCommitment.clar (Sealed Bid Submission)

Bidders submit hash commitments during submission phase. Requires stake.

```clarity
(define-map commitments { tender-id: uint, bidder: principal } { hash: (buff 32), stake: uint })
(use-trait token-trait .token.token-trait)
(use-trait tender-trait .tender.tender-trait)
(use-trait registry-trait .registry.registry-trait)

(define-public (submit-commitment (tender-id uint) (hash (buff 32)) (stake-amount uint) (token <token-trait>) (tender <tender-trait>) (registry <registry-trait>))
  (let ((tender-info (unwrap! (contract-call? tender get-tender tender-id) (err u300))))
    (if (and (>= block-height (get submission-start tender-info)) (<= block-height (get submission-end tender-info)) (unwrap! (contract-call? registry is-registered tx-sender) (err u301)))
      (begin
        (unwrap! (contract-call? token transfer tx-sender (as-contract tx-sender) stake-amount) (err u302))
        (map-set commitments { tender-id: tender-id, bidder: tx-sender } { hash: hash, stake: stake-amount })
        (ok true))
      (err u303))))  ;; Error: Invalid phase or unregistered
```

### 5. BidReveal.clar (Bid Revelation)

Bidders reveal their actual bid (value + nonce) during reveal phase. Verifies against commitment hash.

```clarity
(define-map reveals { tender-id: uint, bidder: principal } { value: uint, nonce: (buff 32) })
(use-trait bid-commit-trait .bidcommitment.bid-commitment-trait)  ;; Assuming trait from BidCommitment

(define-public (reveal-bid (tender-id uint) (value uint) (nonce (buff 32)) (commit <bid-commit-trait>) (tender <tender-trait>))
  (let ((tender-info (unwrap! (contract-call? tender get-tender tender-id) (err u400)))
        (commitment (unwrap! (map-get? commitments { tender-id: tender-id, bidder: tx-sender }) (err u401))))
    (if (and (>= block-height (get reveal-start tender-info)) (<= block-height (get reveal-end tender-info))
             (is-eq (sha256 (concat (unwrap-panic (to-consensus-buff? value)) nonce)) (get hash commitment)))
      (begin
        (map-set reveals { tender-id: tender-id, bidder: tx-sender } { value: value, nonce: nonce })
        (ok true))
      (err u402))))  ;; Error: Invalid phase or hash mismatch
```

### 6. Evaluation.clar (Bid Evaluation)

Evaluates revealed bids (e.g., selects lowest/highest value). Can be extended for complex scoring.

```clarity
(define-map winners uint principal)
(use-trait bid-reveal-trait .bidreveal.bid-reveal-trait)

(define-public (evaluate-tender (tender-id uint) (reveal <bid-reveal-trait>))
  (let ((tender-info (unwrap! (contract-call? tender get-tender tender-id) (err u500))))
    (if (> block-height (get reveal-end tender-info))
      (let ((best-bidder (fold find-best-bidder (map-get-all reveals tender-id) { best-value: uMAX_UINT, best-bidder: none })))
        (map-set winners tender-id (unwrap-panic (get best-bidder best-bidder)))
        (ok true))
      (err u501))))  ;; Error: Reveal phase not ended

(define-private (find-best-bidder (entry { bidder: principal, value: uint }) (acc { best-value: uint, best-bidder: (optional principal) }))
  (if (< (get value entry) (get best-value acc))
    { best-value: (get value entry), best-bidder: (some (get bidder entry)) }
    acc))
```

### 7. Award.clar (Award Distribution)

Distributes the award to the winner, refunds stakes to others, penalizes non-revealers.

```clarity
(use-trait token-trait .token.token-trait)
(use-trait evaluation-trait .evaluation.evaluation-trait)

(define-public (distribute-award (tender-id uint) (award-amount uint) (token <token-trait>) (eval <evaluation-trait>))
  (let ((winner (unwrap! (map-get? winners tender-id) (err u600))))
    (unwrap! (as-contract (contract-call? token transfer (as-contract tx-sender) winner award-amount)) (err u601))
    ;; Refund stakes to all, penalize non-revealers by keeping stake
    (fold refund-stakes (map-get-all commitments tender-id) token)
    (ok true)))

(define-private (refund-stakes (entry { bidder: principal, stake: uint }) (token <token-trait>))
  (if (is-some (map-get? reveals { tender-id: tender-id, bidder: (get bidder entry) }))
    (contract-call? token transfer (as-contract tx-sender) (get bidder entry) (get stake entry))
    (ok false)))  ;; Penalty: Keep stake if not revealed
```

## Usage Example

1. Register a user: Call `register` on Registry.
2. Create a tender: Call `create-tender` on Tender.
3. Submit commitment: Call `submit-commitment` with hash.
4. Reveal: Call `reveal-bid` with value and nonce.
5. Evaluate: Call `evaluate-tender`.
6. Distribute: Call `distribute-award`.

## Testing

Use Clarinet:
```
clarinet test
```

## License

MIT License. See LICENSE file for details.