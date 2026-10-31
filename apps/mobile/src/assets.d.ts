// Metro turns an image import into its asset id (a number), with @2x/@3x picked per screen.
declare module '*.png' {
  const asset: number;
  export default asset;
}
