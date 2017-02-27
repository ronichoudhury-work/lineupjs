/**
 * Created by Samuel Gratzl on 14.08.2015.
 */

import * as d3 from 'd3';
import {merge, delayedCall, AEventDispatcher} from '../utils';
import {Ranking, isNumberColumn} from '../model';
import Column, {IStatistics, ICategoricalStatistics} from '../model/Column';
import {IMultiLevelColumn, isMultiLevelColumn} from '../model/CompositeColumn';
import DataProvider, {IDataRow} from '../provider/ADataProvider';
import IRenderContext from '../renderer/IRenderContext';
import ICellRendererFactory from '../renderer/ICellRendererFactory';
import {renderers as defaultRenderers} from '../renderer/index';

export interface ISlicer {
  (start: number, length: number, row2y: (i: number) => number): {from: number; to: number};
}

export interface IBodyRenderer extends AEventDispatcher {
  histCache: Map<string, Promise<IStatistics>>;

  readonly node: Element;

  setOption(key: string, value: any): void;

  changeDataStorage(data: DataProvider): void;

  select(dataIndex: number, additional?: boolean): void;

  updateFreeze(left: number): void;

  scrolled(): void;

  update(): void;

  fakeHover(dataIndex: number): void;
}

export interface IBodyRenderContext extends IRenderContext<any> {
  cellY(index: number): number;
  cellPrevY(index: number): number;
}

export interface IRankingColumnData {
  readonly column: Column;
  readonly renderer: any;
  readonly shift: number;
}

export interface IRankingData {
  readonly id: string;
  readonly ranking: Ranking;
  readonly order: number[];
  readonly shift: number;
  readonly width: number;
  readonly frozen: IRankingColumnData[];
  readonly frozenWidth: number;
  readonly columns: IRankingColumnData[];
  readonly data: Promise<IDataRow>[];
}

export interface IBodyRendererOptions {
  rowHeight?: number;
  rowPadding?: number;
  rowBarPadding?: number;
  rowBarTopPadding?: number;
  rowBarBottomPadding?: number;
  idPrefix?: string;
  slopeWidth?: number;
  columnPadding?: number;
  stacked?: boolean;
  animation?: boolean;
  animationDuration?: number;

  renderers?: {[key: string]: ICellRendererFactory};

  meanLine?: boolean;

  actions?: {name: string, icon: string, action(v: any): void}[];

  freezeCols?: number;
}

export enum ERenderReason {
  DIRTY,
  SCROLLED
}

abstract class ABodyRenderer extends AEventDispatcher implements IBodyRenderer {
  static readonly EVENT_HOVER_CHANGED = 'hoverChanged';
  static readonly EVENT_RENDER_FINISHED = 'renderFinished';

  protected readonly options: IBodyRendererOptions = {
    rowHeight: 20,
    rowPadding: 1,
    rowBarPadding: 1,
    idPrefix: '',
    slopeWidth: 150,
    columnPadding: 5,
    stacked: true,
    animation: false, //200
    animationDuration: 1000,

    renderers: merge({}, defaultRenderers),

    meanLine: false,

    actions: [],

    freezeCols: 0
  };

  protected readonly $node: d3.Selection<any>;

  histCache = new Map<string, Promise<IStatistics|ICategoricalStatistics>>();

  constructor(protected data: DataProvider, parent: Element, private slicer: ISlicer, root: string, options: IBodyRendererOptions = {}) {
    super();
    //merge options
    merge(this.options, options);

    this.$node = d3.select(parent).append(root).classed('lu-body', true);

    this.changeDataStorage(data);
  }

  protected createEventList() {
    return super.createEventList().concat([ABodyRenderer.EVENT_HOVER_CHANGED, ABodyRenderer.EVENT_RENDER_FINISHED]);
  }

  get node() {
    return <HTMLElement>this.$node.node();
  }

  setOption(key: string, value: any) {
    (<any>this.options)[key] = value;
  }

  changeDataStorage(data: DataProvider) {
    if (this.data) {
      this.data.on([DataProvider.EVENT_DIRTY_VALUES + '.bodyRenderer', DataProvider.EVENT_SELECTION_CHANGED + '.bodyRenderer'], null);
    }
    this.data = data;
    data.on(DataProvider.EVENT_DIRTY_VALUES + '.bodyRenderer', delayedCall(this.update.bind(this), 1));
    data.on(DataProvider.EVENT_SELECTION_CHANGED + '.bodyRenderer', delayedCall(this.drawSelection.bind(this), 1));
  }

  protected showMeanLine(col: Column) {
    //show mean line if option is enabled and top level
    return this.options.meanLine && isNumberColumn(col) && !col.getCompressed() && col.parent instanceof Ranking;
  }

  private fireFinished() {
    this.fire(ABodyRenderer.EVENT_RENDER_FINISHED, this);
  }

  protected createContext(indexShift: number, creator: (col: Column, renderers: {[key: string]: ICellRendererFactory}, context: IRenderContext<any>) => any): IBodyRenderContext {
    const options: {[key: string]: any} = this.options;
    const that = this;

    function findOption(key: string, defaultValue: any) {
      if (key in options) {
        return options[key];
      }
      if (key.indexOf('.') > 0) {
        const p = key.substring(0, key.indexOf('.'));
        key = key.substring(key.indexOf('.') + 1);
        if (p in options && key in options[p]) {
          return options[p][key];
        }
      }
      return defaultValue;
    }

    return {
      cellY: (index: number) => (index + indexShift) * (this.options.rowHeight),
      cellPrevY: (index: number) => (index + indexShift) * (this.options.rowHeight),

      idPrefix: this.options.idPrefix,

      option: findOption,

      rowHeight: () => this.options.rowHeight - this.options.rowPadding,

      renderer(this: IBodyRenderContext, col: Column) {
        return creator(col, that.options.renderers, this);
      }
    };
  }

  select(dataIndex: number, additional = false) {
    return this.data.toggleSelection(dataIndex, additional);
  }

  abstract drawSelection(): void;

  fakeHover(dataIndex: number) {
    this.mouseOver(dataIndex, true);
  }

  mouseOver(dataIndex: number, hover = true) {
    this.fire(ABodyRenderer.EVENT_HOVER_CHANGED, hover ? dataIndex : -1);
  }


  abstract updateFreeze(left: number): void;

  scrolled() {
    return this.update(ERenderReason.SCROLLED);
  }

  /**
   * render the body
   */
  update(reason = ERenderReason.DIRTY) {
    const rankings = this.data.getRankings();
    const maxElems = d3.max(rankings, (d) => d.getOrder().length) || 0;
    const height = this.options.rowHeight * maxElems;
    const visibleRange = this.slicer(0, maxElems, (i) => i * this.options.rowHeight);
    const orderSlicer = (order: number[]) => {
      if (visibleRange.from === 0 && order.length <= visibleRange.to) {
        return order;
      }
      return order.slice(visibleRange.from, Math.min(order.length, visibleRange.to));
    };

    const context = this.createContextImpl(visibleRange.from);
    const orders = rankings.map((r) => orderSlicer(r.getOrder()));
    const data = this.data.fetch(orders);

    const padding = this.options.columnPadding;
    let totalWidth = 0;
    const rdata = rankings.map((r, i) => {
      const cols = r.children.filter((d) => !d.isHidden());

      const rankingShift = totalWidth;
      let width = 0;

      const colData = cols.map((o) => {
        const colShift = width;
        width += (o.getCompressed() ? Column.COMPRESSED_WIDTH : o.getWidth()) + padding;
        if (isMultiLevelColumn(o) && !(<IMultiLevelColumn>o).getCollapsed() && !o.getCompressed()) {
          width += padding * ((<IMultiLevelColumn>o).length - 1);
        }
        return {
          column: o,
          renderer: context.renderer(o),
          shift: colShift
        };
      });
      totalWidth += width;
      totalWidth += this.options.slopeWidth;

      const frozen = colData.slice(0, this.options.freezeCols);

      return {
        id: r.id,
        ranking: r,
        order: orders[i],
        shift: rankingShift,
        width,
        //compute frozen columns just for the first one
        frozen,
        frozenWidth: Math.max(...(frozen.map((d) => d.shift + d.column.getWidth()))),
        columns: colData.slice(this.options.freezeCols),
        data: data[i]
      };
    });
    //one to often
    totalWidth -= this.options.slopeWidth;

    return this.updateImpl(rdata, context, totalWidth, height, reason).then(this.fireFinished.bind(this));
  }

  protected abstract createContextImpl(indexShift: number): IBodyRenderContext;

  protected abstract updateImpl(data: IRankingData[], context: IBodyRenderContext, width: number, height: number, reason: ERenderReason): Promise<void>;
}

export default ABodyRenderer;
