var fs = require('fs')
var path = require('path')
var httpProxy = require('http-proxy')

httpProxy.createServer({
  target: {
    host: 'localhost',
    port: 8888
  },
  ssl: {
    key: fs.readFileSync(path.resolve(__dirname,'proxy-key.pem')),
    cert: fs.readFileSync(path.resolve(__dirname,'proxy-cert.pem'))
  }
}).listen(1234);