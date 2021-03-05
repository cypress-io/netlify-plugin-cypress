// @ts-check
const onPreBuild = require('./onPreBuild')
const onPostBuild = require('./onPostBuild')
const onSuccess = require('./onSuccess')

module.exports = {
  onPreBuild,
  onPostBuild,
  onSuccess,
}
