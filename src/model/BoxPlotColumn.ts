/**
 * Created by bikramkawan on 24/11/2016.
 */
import ValueColumn, {IValueColumnDesc} from './ValueColumn';
import Column from './Column';

export const SORT_METHOD = {
  min: 'min',
  max: 'max',
  median: 'median',
  q1: 'q1',
  q3: 'q3',
  mean: 'mean'
};
// till it can be more spcific
export declare type SortMethod = string;


export interface IBoxPlotColumn {
  getBoxPlotData(row: any, index: number): IBoxPlotData;
  getDomain(): number[];
  getSortMethod(): string;
  setSortMethod(sortMethod: string): void;
}


export interface IBoxPlotColumnDesc extends IValueColumnDesc<IBoxPlotData> {
  readonly domain?: number[];
  readonly sort?: string;
}

export  interface IBoxPlotData {
  readonly min: number;
  readonly max: number;
  readonly median: number;
  readonly q1: number;
  readonly q3: number;
}

export function compareBoxPlot(col: IBoxPlotColumn, a: any, b: any, aIndex: number, bIndex: number) {
  const aVal: any = (col.getBoxPlotData(a, aIndex));
  const bVal: any = (col.getBoxPlotData(b, bIndex));
  if (aVal === null) {
    return bVal === null ? 0 : +1;
  }
  if (bVal === null) {
    return -1;
  }
  const method = col.getSortMethod();
  return aVal[method] - bVal[method];
}


export default class BoxPlotColumn extends ValueColumn<IBoxPlotData> implements IBoxPlotColumn {
  private readonly domain: number[];
  private sort: SortMethod;

  constructor(id: string, desc: IBoxPlotColumnDesc) {
    super(id, desc);
    this.domain = desc.domain || [0, 100];
    this.sort = desc.sort || SORT_METHOD.min;

  }

  compare(a: any, b: any, aIndex: number, bIndex: number): number {
    return compareBoxPlot(this, a, b, aIndex, bIndex);
  }

  getDomain() {
    return this.domain;
  }

  getBoxPlotData(row: any, index: number): IBoxPlotData {
    return this.getValue(row, index);
  }

  getSortMethod() {
    return this.sort;
  }

  setSortMethod(sort: string) {
    if (this.sort === sort) {
      return;
    }
    this.fire([Column.EVENT_SORTMETHOD_CHANGED], this.sort, this.sort = sort);
    // sort by me if not already sorted by me
    if (this.findMyRanker().getSortCriteria().col !== this) {
      this.sortByMe();
    }
  }

  dump(toDescRef: (desc: any) => any): any {
    const r = super.dump(toDescRef);
    r.sortMethod = this.getSortMethod();
    return r;
  }

  restore(dump: any, factory: (dump: any) => Column) {
    super.restore(dump, factory);
    if (dump.sortMethod) {
      this.sort = dump.sortMethod;
    }
  }
}

