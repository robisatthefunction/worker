addEventListener('fetch', event => {
   event.respondWith(fetchAndLog(event.request))
})

/**
 * Fetch and log a given request object
 * @param {Request} request
 */
async function fetchAndLog(request) {
  try {
    // TODO: cache datafile(?) from CDN
    const datafile = await fetch('https://cdn.optimizely.com/public/3745790660/s/10757800833_10757800833.json').then(r => r.json())
    console.log('Datafile:', datafile);

    // needs to load here because of RNG (called implicitly by UUID import)
    const optimizely = loadOptimizely();
    const client = optimizely.createInstance({
      datafile,
      eventDispatcher: {
        dispatchEvent: ({httpVerb, url, params}) => {
          // TODO: deal with these events. Relay to browser?
          console.log(`Intercepted ${httpVerb} ${url} request:`, params);
        }
      },
      clientEngine: 'javascript-sdk',
      clientVersion: '0.1.0'
    });
    console.log('Client: ', client)

    let originalUrl = request.headers.get('X-Requested-Url');
    if (!originalUrl) {
      originalUrl = 'https://www.google.com';
    }
    console.log('origURL ', originalUrl)

    // Use customer supplied ID or generate new. Either way, set to optimizelyEdgeDeciderId cookie.
    const uId = getOrSetUserId(request);
    let bucketString = bucketUser(datafile.experiments, uId, client);
    bucketString = encode(bucketString);
    //const newUrl = originalUrl + '?' + bucketString;
    const newUrl = originalUrl;

    let optlyCookies = [];
    optlyCookies.push(`optimizelyEdgeDeciderId=${uId}`)
    optlyCookies.push(`optimizelyBuckets=${bucketString}`)

    // let headers = new Headers({
    //   'set-cookie': optlyCookie,
    //   'location': newUrl
    // });

    // let resp = {
    //   'status': 302,
    //   'headers': headers
    // };

    // let response = new Response(null, resp);

    // return response;
    let resp = Response.redirect(newUrl, 302);
    console.log('resp is ', resp);
    // Copy response so we can modify the headers.
    let newResp = new Response(null, resp);
    console.log('nresp is ', newResp);

    optlyCookies.forEach(oC => { newResp.headers.append('Set-Cookie', oC); });

    // const redirect = new Request(newUrl, request);
    // console.log('Getting url', redirect.url)
    // let response = await fetch(redirect)
    // // Copy response so we can modify the headers.
    // response = new Response(response.body, response);
    // response.headers.set('set-cookie', optlyCookie);
    return newResp;
  } catch (err) {
    // Display the error stack.
    return new Response(err.stack || err)
  }
}

function getOrSetUserId(request) {
  // Get cookie from the original request
  const cookie = request.headers.get('Cookie');
  let userId;
  if (cookie) {
    // Use the userId if there is one already
    const hasUserId = cookie.match(/optimizelyEndUserId=(\w+)/);
    if (hasUserId) {
      return hasUserId[1];
    }
  }
  // Otherwise generate a random ID
  return `oeu${Date.now()}r${Math.random()}`;
}

// Bucket user for all experiments in the datafile
function bucketUser(experiments, uId, client) {
  let bucketString = '';

  for (var i = 0; i < experiments.length; i++) {
    let exp = experiments[i];
    // TODO: Figure out what to do with events (this decision generates an impression event)
    let varKey = client.activate(exp.key, uId);
    console.log('variation is ', varKey);
    if (varKey) { // variation will be null if user is excluded from exp bc of traffic allocation
      if (bucketString === '') {
        bucketString += '?'
      } else {
        bucketString += '&'
      }
      bucketString += (exp.key + '=' + varKey);
    }
  }
  return bucketString;
}

function encode(str) {
  str = btoa(str);
  return str
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
