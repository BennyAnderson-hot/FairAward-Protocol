import { describe, it, expect, beforeEach } from "vitest";
import { Buffer } from 'node:buffer';

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_TENDER_ID = 101;
const ERR_INVALID_HASH = 102;
const ERR_INVALID_STAKE_AMOUNT = 103;
const ERR_INVALID_PHASE = 104;
const ERR_NOT_REGISTERED = 105;
const ERR_COMMITMENT_ALREADY_EXISTS = 106;
const ERR_COMMITMENT_NOT_FOUND = 107;
const ERR_AUTHORITY_NOT_VERIFIED = 109;
const ERR_INVALID_MIN_STAKE = 110;
const ERR_INVALID_MAX_STAKE = 111;
const ERR_MAX_COMMITMENTS_EXCEEDED = 114;
const ERR_INVALID_UPDATE_PARAM = 113;
const ERR_INVALID_COMMITMENT_TYPE = 115;
const ERR_INVALID_FEE_RATE = 116;
const ERR_INVALID_GRACE_PERIOD = 117;
const ERR_INVALID_LOCATION = 118;
const ERR_INVALID_CURRENCY = 119;

type Result<T> = 
  | { ok: true; value: T }
  | { ok: false; value: number };

interface Commitment {
  tenderId: number;
  bidder: string;
  hash: Buffer;
  stake: number;
  timestamp: number;
  commitmentType: string;
  feeRate: number;
  gracePeriod: number;
  location: string;
  currency: string;
  status: boolean;
}

interface CommitmentUpdate {
  updateHash: Buffer;
  updateStake: number;
  updateTimestamp: number;
  updater: string;
}

interface TenderInfo {
  submissionStart: number;
  submissionEnd: number;
}

class MockTokenTrait {
  transfer(_from: string, _to: string, _amount: number): Result<boolean> {
    return { ok: true, value: true };
  }
}

class MockTenderTrait {
  getTender(_id: number): Result<TenderInfo> {
    return { ok: true, value: { submissionStart: 0, submissionEnd: 100 } };
  }
}

class MockRegistryTrait {
  isRegistered(_principal: string): Result<boolean> {
    return { ok: true, value: true };
  }
}

class BidCommitmentMock {
  state: {
    nextCommitmentId: number;
    maxCommitments: number;
    commitmentFee: number;
    authorityContract: string | null;
    minStake: number;
    maxStake: number;
    commitments: Map<number, Commitment>;
    commitmentUpdates: Map<number, CommitmentUpdate>;
    commitmentsByTender: Map<string, number>;
  } = {
    nextCommitmentId: 0,
    maxCommitments: 1000,
    commitmentFee: 1000,
    authorityContract: null,
    minStake: 100,
    maxStake: 1000000,
    commitments: new Map(),
    commitmentUpdates: new Map(),
    commitmentsByTender: new Map(),
  };
  blockHeight: number = 50;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  tokenTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextCommitmentId: 0,
      maxCommitments: 1000,
      commitmentFee: 1000,
      authorityContract: null,
      minStake: 100,
      maxStake: 1000000,
      commitments: new Map(),
      commitmentUpdates: new Map(),
      commitmentsByTender: new Map(),
    };
    this.blockHeight = 50;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.tokenTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxCommitments(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: ERR_MAX_COMMITMENTS_EXCEEDED };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.maxCommitments = newMax;
    return { ok: true, value: true };
  }

  setCommitmentFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.commitmentFee = newFee;
    return { ok: true, value: true };
  }

  setMinStake(newMin: number): Result<boolean> {
    if (newMin <= 0) return { ok: false, value: ERR_INVALID_MIN_STAKE };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.minStake = newMin;
    return { ok: true, value: true };
  }

  setMaxStake(newMax: number): Result<boolean> {
    if (newMax <= this.state.minStake) return { ok: false, value: ERR_INVALID_MAX_STAKE };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.maxStake = newMax;
    return { ok: true, value: true };
  }

  submitCommitment(
    tenderId: number,
    hash: Buffer,
    stakeAmount: number,
    commitmentType: string,
    feeRate: number,
    gracePeriod: number,
    location: string,
    currency: string,
    token: MockTokenTrait,
    tender: MockTenderTrait,
    registry: MockRegistryTrait
  ): Result<number> {
    if (this.state.nextCommitmentId >= this.state.maxCommitments) return { ok: false, value: ERR_MAX_COMMITMENTS_EXCEEDED };
    if (tenderId <= 0) return { ok: false, value: ERR_INVALID_TENDER_ID };
    if (hash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (stakeAmount < this.state.minStake || stakeAmount > this.state.maxStake) return { ok: false, value: ERR_INVALID_STAKE_AMOUNT };
    const tenderInfo = tender.getTender(tenderId);
    if (!tenderInfo.ok) return { ok: false, value: ERR_INVALID_TENDER_ID };
    if (this.blockHeight < tenderInfo.value.submissionStart || this.blockHeight > tenderInfo.value.submissionEnd) return { ok: false, value: ERR_INVALID_PHASE };
    if (!["sealed", "open", "hybrid"].includes(commitmentType)) return { ok: false, value: ERR_INVALID_COMMITMENT_TYPE };
    if (feeRate > 10) return { ok: false, value: ERR_INVALID_FEE_RATE };
    if (gracePeriod > 7) return { ok: false, value: ERR_INVALID_GRACE_PERIOD };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["STX", "USD", "BTC"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    const isRegistered = registry.isRegistered(this.caller);
    if (!isRegistered.ok || !isRegistered.value) return { ok: false, value: ERR_NOT_REGISTERED };
    const key = `${tenderId}-${this.caller}`;
    if (this.state.commitmentsByTender.has(key)) return { ok: false, value: ERR_COMMITMENT_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    token.transfer(this.caller, this.state.authorityContract, this.state.commitmentFee);
    this.tokenTransfers.push({ amount: this.state.commitmentFee, from: this.caller, to: this.state.authorityContract! });
    token.transfer(this.caller, "contract", stakeAmount);
    this.tokenTransfers.push({ amount: stakeAmount, from: this.caller, to: "contract" });

    const id = this.state.nextCommitmentId;
    const commitment: Commitment = {
      tenderId,
      bidder: this.caller,
      hash,
      stake: stakeAmount,
      timestamp: this.blockHeight,
      commitmentType,
      feeRate,
      gracePeriod,
      location,
      currency,
      status: true,
    };
    this.state.commitments.set(id, commitment);
    this.state.commitmentsByTender.set(key, id);
    this.state.nextCommitmentId++;
    return { ok: true, value: id };
  }

  getCommitment(id: number): Commitment | undefined {
    return this.state.commitments.get(id);
  }

  updateCommitment(
    commitmentId: number,
    updateHash: Buffer,
    updateStake: number,
    token: MockTokenTrait
  ): Result<boolean> {
    const commitment = this.state.commitments.get(commitmentId);
    if (!commitment) return { ok: false, value: ERR_COMMITMENT_NOT_FOUND };
    if (commitment.bidder !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (updateHash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (updateStake < this.state.minStake || updateStake > this.state.maxStake) return { ok: false, value: ERR_INVALID_STAKE_AMOUNT };

    const stakeDiff = updateStake - commitment.stake;
    token.transfer(this.caller, "contract", stakeDiff);
    this.tokenTransfers.push({ amount: stakeDiff, from: this.caller, to: "contract" });

    const updated: Commitment = {
      ...commitment,
      hash: updateHash,
      stake: updateStake,
      timestamp: this.blockHeight,
    };
    this.state.commitments.set(commitmentId, updated);
    this.state.commitmentUpdates.set(commitmentId, {
      updateHash,
      updateStake,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getCommitmentCount(): Result<number> {
    return { ok: true, value: this.state.nextCommitmentId };
  }

  checkCommitmentExistence(tenderId: number, bidder: string): Result<boolean> {
    const key = `${tenderId}-${bidder}`;
    return { ok: true, value: this.state.commitmentsByTender.has(key) };
  }
}

describe("BidCommitment Contract Tests", () => {
  let contract: BidCommitmentMock;
  let token: MockTokenTrait;
  let tender: MockTenderTrait;
  let registry: MockRegistryTrait;

  beforeEach(() => {
    contract = new BidCommitmentMock();
    token = new MockTokenTrait();
    tender = new MockTenderTrait();
    registry = new MockRegistryTrait();
    contract.reset();
  });

  it("submits a commitment successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = Buffer.alloc(32);
    const result = contract.submitCommitment(
      1,
      hash,
      500,
      "sealed",
      5,
      3,
      "LocationX",
      "STX",
      token,
      tender,
      registry
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const commitment = contract.getCommitment(0);
    expect(commitment?.tenderId).toBe(1);
    expect(commitment?.bidder).toBe("ST1TEST");
    expect(commitment?.stake).toBe(500);
    expect(commitment?.commitmentType).toBe("sealed");
    expect(commitment?.feeRate).toBe(5);
    expect(commitment?.gracePeriod).toBe(3);
    expect(commitment?.location).toBe("LocationX");
    expect(commitment?.currency).toBe("STX");
    expect(contract.tokenTransfers).toEqual([
      { amount: 1000, from: "ST1TEST", to: "ST2TEST" },
      { amount: 500, from: "ST1TEST", to: "contract" },
    ]);
  });

  it("rejects duplicate commitments", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = Buffer.alloc(32);
    contract.submitCommitment(
      1,
      hash,
      500,
      "sealed",
      5,
      3,
      "LocationX",
      "STX",
      token,
      tender,
      registry
    );
    const result = contract.submitCommitment(
      1,
      hash,
      600,
      "open",
      6,
      4,
      "LocationY",
      "USD",
      token,
      tender,
      registry
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_COMMITMENT_ALREADY_EXISTS);
  });

  it("rejects submission without authority contract", () => {
    const hash = Buffer.alloc(32);
    const result = contract.submitCommitment(
      1,
      hash,
      500,
      "sealed",
      5,
      3,
      "LocationX",
      "STX",
      token,
      tender,
      registry
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid stake amount", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = Buffer.alloc(32);
    const result = contract.submitCommitment(
      1,
      hash,
      50,
      "sealed",
      5,
      3,
      "LocationX",
      "STX",
      token,
      tender,
      registry
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STAKE_AMOUNT);
  });

  it("rejects invalid commitment type", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = Buffer.alloc(32);
    const result = contract.submitCommitment(
      1,
      hash,
      500,
      "invalid",
      5,
      3,
      "LocationX",
      "STX",
      token,
      tender,
      registry
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_COMMITMENT_TYPE);
  });

  it("updates a commitment successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = Buffer.alloc(32);
    contract.submitCommitment(
      1,
      hash,
      500,
      "sealed",
      5,
      3,
      "LocationX",
      "STX",
      token,
      tender,
      registry
    );
    const updateHash = Buffer.alloc(32, 1);
    const result = contract.updateCommitment(0, updateHash, 600, token);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const commitment = contract.getCommitment(0);
    expect(commitment?.stake).toBe(600);
    const update = contract.state.commitmentUpdates.get(0);
    expect(update?.updateStake).toBe(600);
    expect(update?.updater).toBe("ST1TEST");
    expect(contract.tokenTransfers[contract.tokenTransfers.length - 1]).toEqual({ amount: 100, from: "ST1TEST", to: "contract" });
  });

  it("rejects update for non-existent commitment", () => {
    contract.setAuthorityContract("ST2TEST");
    const updateHash = Buffer.alloc(32);
    const result = contract.updateCommitment(99, updateHash, 600, token);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_COMMITMENT_NOT_FOUND);
  });

  it("rejects update by non-bidder", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = Buffer.alloc(32);
    contract.submitCommitment(
      1,
      hash,
      500,
      "sealed",
      5,
      3,
      "LocationX",
      "STX",
      token,
      tender,
      registry
    );
    contract.caller = "ST3FAKE";
    const updateHash = Buffer.alloc(32);
    const result = contract.updateCommitment(0, updateHash, 600, token);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets commitment fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setCommitmentFee(2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.commitmentFee).toBe(2000);
    const hash = Buffer.alloc(32);
    contract.submitCommitment(
      1,
      hash,
      500,
      "sealed",
      5,
      3,
      "LocationX",
      "STX",
      token,
      tender,
      registry
    );
    expect(contract.tokenTransfers[0]).toEqual({ amount: 2000, from: "ST1TEST", to: "ST2TEST" });
  });

  it("rejects commitment fee change without authority", () => {
    const result = contract.setCommitmentFee(2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("returns correct commitment count", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = Buffer.alloc(32);
    contract.submitCommitment(
      1,
      hash,
      500,
      "sealed",
      5,
      3,
      "LocationX",
      "STX",
      token,
      tender,
      registry
    );
    contract.submitCommitment(
      2,
      hash,
      600,
      "open",
      6,
      4,
      "LocationY",
      "USD",
      token,
      tender,
      registry
    );
    const result = contract.getCommitmentCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks commitment existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = Buffer.alloc(32);
    contract.submitCommitment(
      1,
      hash,
      500,
      "sealed",
      5,
      3,
      "LocationX",
      "STX",
      token,
      tender,
      registry
    );
    const result = contract.checkCommitmentExistence(1, "ST1TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkCommitmentExistence(1, "ST3FAKE");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects submission with max commitments exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxCommitments = 1;
    const hash = Buffer.alloc(32);
    contract.submitCommitment(
      1,
      hash,
      500,
      "sealed",
      5,
      3,
      "LocationX",
      "STX",
      token,
      tender,
      registry
    );
    const result = contract.submitCommitment(
      2,
      hash,
      600,
      "open",
      6,
      4,
      "LocationY",
      "USD",
      token,
      tender,
      registry
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_COMMITMENTS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets min stake successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMinStake(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.minStake).toBe(200);
  });

  it("rejects invalid min stake", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMinStake(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MIN_STAKE);
  });

  it("sets max stake successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMaxStake(2000000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxStake).toBe(2000000);
  });

  it("rejects invalid max stake", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMaxStake(50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MAX_STAKE);
  });
});