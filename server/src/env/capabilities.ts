
export interface Unavailable {
  who: string;
  why: string;
}

type Platform = NodeJS.Platform;

export function foregroundProcess(platform: Platform = process.platform): Unavailable | null {
  if (platform !== 'win32') return null;
  return {
    who: 'ConPTY',
    why: 'Windows has no foreground process group — the terminal cannot say what is running in it',
  };
}
