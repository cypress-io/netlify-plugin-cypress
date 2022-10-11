// a little utility to debug our static file server
import { serveFolder } from './utils.js'

serveFolder('./public', '8080', false)
