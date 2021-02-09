// @ts-check
const puppeteer = require('puppeteer')
const debug = require('debug')('netlify-plugin-cypress')
const { ping } = require('./ping')

const getBrowserPath = async () => {
  const browserFetcher = puppeteer.createBrowserFetcher()
  const revisions = await browserFetcher.localRevisions()
  debug('local Chromium revisions %o', revisions)
  if (revisions.length <= 0) {
    throw new Error('Could not find local browser')
  }
  const info = await browserFetcher.revisionInfo(revisions[0])
  debug('found Chromium %o', info)
  return info.executablePath
}

module.exports = {
  ping,
  getBrowserPath,
}
