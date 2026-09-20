/** `?raw` means a file as a string: both vitest and the plugin build understand it. */
declare module '*?raw' {
  const text: string;
  export default text;
}
