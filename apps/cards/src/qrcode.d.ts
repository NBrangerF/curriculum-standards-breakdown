// The part of the `qrcode` package the share cards use.
declare module 'qrcode' {
    type QRCodeModules = { size: number, get(row: number, col: number): number | boolean }
    const QRCode: { create(text: string, options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): { modules: QRCodeModules } }
    export default QRCode
}
