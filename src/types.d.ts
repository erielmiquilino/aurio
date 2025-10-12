declare module '*?worker&url' {
  const url: string;
  export default url;
}

// Minimal chrome type surface for TS without global types
// You can replace by installing @types/chrome if desired
declare const chrome: any;


