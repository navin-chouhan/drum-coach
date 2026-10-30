// The one place that picks the highway renderer. To move to Skia (@shopify/react-native-skia, once added): write
// render/skia.tsx implementing HighwayRendererProps and export it here instead.
export { ViewHighwayRenderer as HighwayRenderer } from './views';
export type { HighwayRendererProps, LaneFlashes } from './types';
