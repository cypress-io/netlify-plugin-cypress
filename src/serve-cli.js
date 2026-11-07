// a little utility to serve a static folder with the same server
// the plugin uses during postBuild
// node ./src/serve-cli.js [folder] [port]
const { serveFolder } = require('./utils')

const folder = process.argv[2] || './public'
const port = Number(process.argv[3] || 8080)
console.log('serving folder %s at port %d', folder, port)
const server = serveFolder(folder, port, false)
server.on('listening', () => {
  console.log('listening at http://localhost:%d', port)
})
server.on('error', (err) => {
  // for example EADDRINUSE when the port is already taken
  console.error('could not serve folder %s at port %d', folder, port, err)
  process.exit(1)
})
