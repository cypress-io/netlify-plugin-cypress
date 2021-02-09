// a little utility to debug our static file server
const { serveFolder } = require('./utils')

serveFolder('./public', '8080', false)
