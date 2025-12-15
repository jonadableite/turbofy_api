const http = require('http');

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
const path = '/healthz';

const req = http.get({ hostname: 'localhost', port, path, timeout: 4000 }, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('error', () => process.exit(1));
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});