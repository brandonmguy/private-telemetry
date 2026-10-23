'use strict';

Promise.all([
  fetch(`http://127.0.0.1:${process.env.API_PORT || 3000}/api/health`, { signal: AbortSignal.timeout(4000) }),
  fetch(`http://127.0.0.1:${process.env.RECV_PORT || 3001}/`, { signal: AbortSignal.timeout(4000) }),
]).then(results => {
  if (results.some(response => !response.ok)) process.exitCode = 1;
}).catch(() => { process.exitCode = 1; });
