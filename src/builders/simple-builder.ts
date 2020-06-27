import { Builder } from '../builders/builder';
import { Collector } from '../collectors/collector';
import {
  Address,
  Amount,
  AmountUnit,
  Cell,
  RawTransaction,
  Transaction,
} from '../models';
import PWCore from '..';

export class SimpleBuilder extends Builder {
  constructor(
    private address: Address,
    private amount: Amount,
    feeRate?: number,
    collector?: Collector
  ) {
    super(feeRate, collector);
  }

  async build(fee: Amount = new Amount('0')): Promise<Transaction> {
    const outputCell = new Cell(this.amount, this.address.toLockScript());
    const neededAmount = this.amount.add(Builder.MIN_CHANGE).add(fee);
    let inputSum = new Amount('0');
    const inputCells: Cell[] = [];

    // fill the inputs
    const cells = await this.collector.collect(
      PWCore.provider.address,
      neededAmount
    );
    for (const cell of cells) {
      inputCells.push(cell);
      inputSum = inputSum.add(cell.capacity);
      if (inputSum.gt(neededAmount)) break;
    }

    if (inputSum.lt(this.amount)) {
      throw new Error(
        `input capacity not enough, need ${outputCell.capacity.toString(
          AmountUnit.ckb
        )}, got ${inputSum.toString(AmountUnit.ckb)}`
      );
    }

    const changeCell = new Cell(
      inputSum.sub(outputCell.capacity),
      PWCore.provider.address.toLockScript()
    );

    const tx = new Transaction(
      new RawTransaction(inputCells, [outputCell, changeCell]),
      [Builder.WITNESS_ARGS.Secp256k1]
    );

    this.fee = Builder.calcFee(tx);

    if (changeCell.capacity.gte(Builder.MIN_CHANGE.add(this.fee))) {
      changeCell.capacity = changeCell.capacity.sub(this.fee);
      tx.raw.outputs.pop();
      tx.raw.outputs.push(changeCell);
      return tx;
    }

    return this.build(this.fee);
  }

  getCollector() {
    return this.collector;
  }
}