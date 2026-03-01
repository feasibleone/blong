declare module 'ut-function.cbc' {
  export default function cbc(key: string | Buffer, validate?: boolean): {
    encrypt(data: string | Buffer): Buffer;
    decrypt(data: string | Buffer): string;
  }
}