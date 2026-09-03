import QRCode from 'qrcode';

/**
 * Generates a PNG buffer containing a QR code.
 * Opens /promo?code=… → redirect to site home + cabinet; coupon prefills after login.
 */
export async function generateCouponQR(couponCode: string): Promise<Buffer> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://citylegend.art').replace(/\/$/, '');
  const url = `${siteUrl}/promo?code=${encodeURIComponent(couponCode)}`;
  return QRCode.toBuffer(url, {
    type: 'png',
    margin: 2,
    width: 512,
    errorCorrectionLevel: 'M',
  });
}
