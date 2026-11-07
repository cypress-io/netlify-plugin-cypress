// @ts-check
const onPreBuild = require('./onPreBuild')
const onPostBuild = require('./onPostBuild')
const onSuccess = require('./onSuccess')
const onEnd = require('./onEnd')

module.exports = {
  onPreBuild,
  onPostBuild,
  onSuccess,
  onEnd,
}
