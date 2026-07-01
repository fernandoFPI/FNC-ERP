import puppeteer, { type Browser } from 'puppeteer'
import { env } from '@fnc-erp/config'
import { logger } from '@fnc-erp/logger'

const log = logger.child({ module: 'pdf-engine' })

let browser: Browser | null = null

export async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) {
    return browser
  }

  log.info('launching Puppeteer browser')

  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
  ]

  browser = env.PUPPETEER_EXECUTABLE_PATH
    ? await puppeteer.launch({ headless: true, executablePath: env.PUPPETEER_EXECUTABLE_PATH, args: launchArgs })
    : await puppeteer.launch({ headless: true, args: launchArgs })

  browser.on('disconnected', () => {
    log.warn('Puppeteer browser disconnected — will relaunch on next request')
    browser = null
  })

  log.info('Puppeteer browser launched')
  return browser
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close()
    browser = null
    log.info('Puppeteer browser closed')
  }
}

process.on('SIGTERM', () => { void closeBrowser() })
process.on('SIGINT', () => { void closeBrowser() })
