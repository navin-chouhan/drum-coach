// Sheet music on the iPad (A6n): NotationView, the lesson player's default view (D8), with the same props as
// NoteHighway. The pure parts (page geometry, colours, the result log, Clock sync) are exported for tests and the take
// adapter.
export { NotationView, type NotationViewProps } from './NotationView';
export {
  createResultLog, mergeBatch, sheetColors, sheetGeometry, type ResultBatch, type SheetChart, type SheetColors, type SheetGeometry,
} from './sheetModel';
