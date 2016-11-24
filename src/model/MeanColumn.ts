/**
 * Created by sam on 04.11.2016.
 */

import CompositeNumberColumn from './CompositeNumberColumn';

/**
 * factory for creating a description creating a mean column
 * @param label
 * @returns {{type: string, label: string}}
 */
export function createDesc(label: string = 'Mean') {
  return {type: 'mean', label: label};
}

export default class MeanColumn extends CompositeNumberColumn {

  protected compute(row: any, index: number) {
    if (this._children.length === 0) {
      return 0;
    }
    return (this._children.reduce((act, d) => act + d.getValue(row, index), 0) / this._children.length);
  }
}
