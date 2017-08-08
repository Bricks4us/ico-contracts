import alis from '../utilities/alis';
import ether from './helpers/ether';
import advanceToBlock from './helpers/advanceToBlock';
import EVMThrow from './helpers/EVMThrow';

import { AlisToken, AlisCrowdsale, cap, rate,
  initialAlisFundBalance, goal, should, setTimingToBaseTokenRate,
} from './helpers/alis_helper';

contract('AlisCrowdsale', ([owner, wallet, thirdparty]) => {
  before(async () => {
    await setTimingToBaseTokenRate();
  });

  beforeEach(async function () {
    this.startBlock = web3.eth.blockNumber + 10;
    this.endBlock = web3.eth.blockNumber + 20;

    this.crowdsale = await AlisCrowdsale.new(this.startBlock, this.endBlock,
      rate.base, wallet, cap, initialAlisFundBalance, goal,
      rate.preSale, rate.week1, rate.week2, rate.week3, { from: owner });

    this.token = AlisToken.at(await this.crowdsale.token());
  });

  describe('finalize', () => {
    it('can be finalized by owner after ending', async function () {
      await advanceToBlock(this.endBlock);
      await this.crowdsale.finalize({ from: owner }).should.be.fulfilled;
    });

    it('logs finalized', async function () {
      await advanceToBlock(this.endBlock);
      const { logs } = await this.crowdsale.finalize({ from: owner });
      const event = logs.find(e => e.event === 'Finalized');
      should.exist(event);
    });

    it('finishes minting of token', async function () {
      await advanceToBlock(this.endBlock);
      await this.crowdsale.finalize({ from: owner });
      const finished = await this.token.mintingFinished();
      finished.should.equal(true);
    });
  });

  describe('remaining tokens', () => {
    it('should store to ALIS fund if tokens are remain', async function () {
      await advanceToBlock(this.startBlock - 1);

      // ether * rate = sold amount
      // 100,000 * 2,000 = 200,000,000
      await this.crowdsale.send(ether(100000));

      // offered amount - sold amount = remain
      // 250,000,000 - 200,000,000 = 50,000,000
      const remainingTokens = alis(50000000);

      let expect = alis(250000000);
      let actual = await this.token.balanceOf(wallet);
      await actual.should.be.bignumber.equal(expect);

      await advanceToBlock(this.endBlock);
      await this.crowdsale.finalize({ from: owner });

      expect = expect.plus(remainingTokens);
      actual = await this.token.balanceOf(wallet);
      await actual.should.be.bignumber.equal(expect);
    });

    it('should not care about goal, to keep code simple', async function () {
      let expect = alis(250000000);
      let actual = await this.token.balanceOf(wallet);
      await actual.should.be.bignumber.equal(expect);

      const goalReached = await this.crowdsale.goalReached();
      await goalReached.should.equal(false);

      await advanceToBlock(this.endBlock);
      await this.crowdsale.finalize({ from: owner });

      expect = alis(500000000);
      actual = await this.token.balanceOf(wallet);
      await actual.should.be.bignumber.equal(expect);
    });

    it('should not do anything if no remaining token', async function () {
      // No remaining token already.
      const capSameAsInitialAlisFundBalance = initialAlisFundBalance;
      this.crowdsale = await AlisCrowdsale.new(this.startBlock, this.endBlock,
        rate.base, wallet, capSameAsInitialAlisFundBalance, initialAlisFundBalance,
        goal, rate.preSale, rate.week1, rate.week2, rate.week3, { from: owner });

      this.token = AlisToken.at(await this.crowdsale.token());

      const expect = alis(250000000);
      let actual = await this.token.balanceOf(wallet);
      await actual.should.be.bignumber.equal(expect);

      await advanceToBlock(this.endBlock);
      await this.crowdsale.finalize({ from: owner });

      // Same balance of before finalize.
      actual = await this.token.balanceOf(wallet);
      await actual.should.be.bignumber.equal(expect);
    });
  });

  describe('reject finalize', () => {
    it('cannot be finalized before ending', async function () {
      await this.crowdsale.finalize({ from: owner }).should.be.rejectedWith(EVMThrow);
    });

    it('cannot be finalized by third party after ending', async function () {
      await advanceToBlock(this.endBlock);
      await this.crowdsale.finalize({ from: thirdparty }).should.be.rejectedWith(EVMThrow);
    });

    it('cannot be finalized twice', async function () {
      await advanceToBlock(this.endBlock + 1);
      await this.crowdsale.finalize({ from: owner });
      await this.crowdsale.finalize({ from: owner }).should.be.rejectedWith(EVMThrow);
    });
  });
});