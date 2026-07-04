import { getBrowser } from './engine.js'
import { logger } from '@fnc-erp/logger'

const log = logger.child({ module: 'pdf-renderer' })

export interface PDFOptions {
  format?: 'A4' | 'Letter'
  landscape?: boolean
  marginTop?: string
  marginBottom?: string
  marginLeft?: string
  marginRight?: string
}

export async function renderHTMLToPDF(
  html: string,
  options: PDFOptions = {},
): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setViewport({ width: 1200, height: 1600 })
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdfBuffer = await page.pdf({
      format: options.format ?? 'A4',
      landscape: options.landscape ?? false,
      printBackground: true,
      margin: {
        top: options.marginTop ?? '15mm',
        bottom: options.marginBottom ?? '20mm',
        left: options.marginLeft ?? '15mm',
        right: options.marginRight ?? '15mm',
      },
      displayHeaderFooter: false,
    })

    log.info({ size: pdfBuffer.length }, 'PDF rendered successfully')
    return Buffer.from(pdfBuffer)
  } catch (err) {
    log.error({ err }, 'PDF rendering failed')
    throw err
  } finally {
    await page.close()
  }
}
