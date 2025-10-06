(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-TENDER-ID u101)
(define-constant ERR-INVALID-HASH u102)
(define-constant ERR-INVALID-STAKE-AMOUNT u103)
(define-constant ERR-INVALID-PHASE u104)
(define-constant ERR-NOT-REGISTERED u105)
(define-constant ERR-COMMITMENT-ALREADY-EXISTS u106)
(define-constant ERR-COMMITMENT-NOT-FOUND u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u109)
(define-constant ERR-INVALID-MIN-STAKE u110)
(define-constant ERR-INVALID-MAX-STAKE u111)
(define-constant ERR-COMMITMENT-UPDATE-NOT-ALLOWED u112)
(define-constant ERR-INVALID-UPDATE-PARAM u113)
(define-constant ERR-MAX-COMMITMENTS-EXCEEDED u114)
(define-constant ERR-INVALID-COMMITMENT-TYPE u115)
(define-constant ERR-INVALID-FEE-RATE u116)
(define-constant ERR-INVALID-GRACE-PERIOD u117)
(define-constant ERR-INVALID-LOCATION u118)
(define-constant ERR-INVALID-CURRENCY u119)
(define-constant ERR-INVALID-STATUS u120)
(define-constant ERR-TRANSFER-FAILED u121)
(define-constant ERR-INVALID-TRAIT u122)

(define-data-var next-commitment-id uint u0)
(define-data-var max-commitments uint u1000)
(define-data-var commitment-fee uint u1000)
(define-data-var authority-contract (optional principal) none)
(define-data-var min-stake uint u100)
(define-data-var max-stake uint u1000000)

(define-map commitments
  uint
  {
    tender-id: uint,
    bidder: principal,
    hash: (buff 32),
    stake: uint,
    timestamp: uint,
    commitment-type: (string-utf8 50),
    fee-rate: uint,
    grace-period: uint,
    location: (string-utf8 100),
    currency: (string-utf8 20),
    status: bool
  }
)

(define-map commitments-by-tender
  { tender-id: uint, bidder: principal }
  uint)

(define-map commitment-updates
  uint
  {
    update-hash: (buff 32),
    update-stake: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-trait token-trait
  (
    (transfer (principal principal uint) (response bool uint))
    (get-balance (principal) (response uint uint))
  )
)

(define-trait tender-trait
  (
    (get-tender (uint) (response { submission-start: uint, submission-end: uint } uint))
  )
)

(define-trait registry-trait
  (
    (is-registered (principal) (response bool uint))
  )
)

(define-read-only (get-commitment (id uint))
  (map-get? commitments id)
)

(define-read-only (get-commitment-updates (id uint))
  (map-get? commitment-updates id)
)

(define-read-only (is-commitment-registered (tender-id uint) (bidder principal))
  (is-some (map-get? commitments-by-tender { tender-id: tender-id, bidder: bidder }))
)

(define-private (validate-tender-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-TENDER-ID))
)

(define-private (validate-hash (h (buff 32)))
  (if (is-eq (len h) u32)
      (ok true)
      (err ERR-INVALID-HASH))
)

(define-private (validate-stake-amount (amount uint))
  (let ((min (var-get min-stake)) (max (var-get max-stake)))
    (if (and (>= amount min) (<= amount max))
        (ok true)
        (err ERR-INVALID-STAKE-AMOUNT)))
)

(define-private (validate-phase (tender-info { submission-start: uint, submission-end: uint }))
  (let ((height block-height))
    (if (and (>= height (get submission-start tender-info)) (<= height (get submission-end tender-info)))
        (ok true)
        (err ERR-INVALID-PHASE)))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-commitment-type (type (string-utf8 50)))
  (if (or (is-eq type "sealed") (is-eq type "open") (is-eq type "hybrid"))
      (ok true)
      (err ERR-INVALID-COMMITMENT-TYPE))
)

(define-private (validate-fee-rate (rate uint))
  (if (<= rate u10)
      (ok true)
      (err ERR-INVALID-FEE-RATE))
)

(define-private (validate-grace-period (period uint))
  (if (<= period u7)
      (ok true)
      (err ERR-INVALID-GRACE-PERIOD))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD") (is-eq cur "BTC"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-commitments (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-COMMITMENTS-EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-commitments new-max)
    (ok true)
  )
)

(define-public (set-commitment-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set commitment-fee new-fee)
    (ok true)
  )
)

(define-public (set-min-stake (new-min uint))
  (begin
    (asserts! (> new-min u0) (err ERR-INVALID-MIN-STAKE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set min-stake new-min)
    (ok true)
  )
)

(define-public (set-max-stake (new-max uint))
  (begin
    (asserts! (> new-max (var-get min-stake)) (err ERR-INVALID-MAX-STAKE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-stake new-max)
    (ok true)
  )
)

(define-public (submit-commitment
  (tender-id uint)
  (hash (buff 32))
  (stake-amount uint)
  (commitment-type (string-utf8 50))
  (fee-rate uint)
  (grace-period uint)
  (location (string-utf8 100))
  (currency (string-utf8 20))
  (token <token-trait>)
  (tender <tender-trait>)
  (registry <registry-trait>)
)
  (let (
        (next-id (var-get next-commitment-id))
        (current-max (var-get max-commitments))
        (authority (var-get authority-contract))
        (tender-info (unwrap! (contract-call? tender get-tender tender-id) (err ERR-INVALID-TENDER-ID)))
        (is-registered (unwrap! (contract-call? registry is-registered tx-sender) (err ERR-NOT-REGISTERED)))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-COMMITMENTS-EXCEEDED))
    (try! (validate-tender-id tender-id))
    (try! (validate-hash hash))
    (try! (validate-stake-amount stake-amount))
    (try! (validate-phase tender-info))
    (try! (validate-commitment-type commitment-type))
    (try! (validate-fee-rate fee-rate))
    (try! (validate-grace-period grace-period))
    (try! (validate-location location))
    (try! (validate-currency currency))
    (asserts! (not (is-commitment-registered tender-id tx-sender)) (err ERR-COMMITMENT-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (contract-call? token transfer tx-sender authority-recipient (var-get commitment-fee)))
    )
    (try! (contract-call? token transfer tx-sender (as-contract tx-sender) stake-amount))
    (map-set commitments next-id
      {
        tender-id: tender-id,
        bidder: tx-sender,
        hash: hash,
        stake: stake-amount,
        timestamp: block-height,
        commitment-type: commitment-type,
        fee-rate: fee-rate,
        grace-period: grace-period,
        location: location,
        currency: currency,
        status: true
      }
    )
    (map-set commitments-by-tender { tender-id: tender-id, bidder: tx-sender } next-id)
    (var-set next-commitment-id (+ next-id u1))
    (print { event: "commitment-submitted", id: next-id })
    (ok next-id)
  )
)

(define-public (update-commitment
  (commitment-id uint)
  (update-hash (buff 32))
  (update-stake uint)
  (token <token-trait>)
)
  (let ((commitment (map-get? commitments commitment-id)))
    (match commitment
      c
        (begin
          (asserts! (is-eq (get bidder c) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-hash update-hash))
          (try! (validate-stake-amount update-stake))
          (try! (contract-call? token transfer tx-sender (as-contract tx-sender) (- update-stake (get stake c))))
          (map-set commitments commitment-id
            (merge c
              {
                hash: update-hash,
                stake: update-stake,
                timestamp: block-height
              }
            )
          )
          (map-set commitment-updates commitment-id
            {
              update-hash: update-hash,
              update-stake: update-stake,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "commitment-updated", id: commitment-id })
          (ok true)
        )
      (err ERR-COMMITMENT-NOT-FOUND)
    )
  )
)

(define-public (get-commitment-count)
  (ok (var-get next-commitment-id))
)

(define-public (check-commitment-existence (tender-id uint) (bidder principal))
  (ok (is-commitment-registered tender-id bidder))
)