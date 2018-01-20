/**
 * @author Philip Van Raalte
 * @date 2018-01-12
 */
const Database = require('arangojs').Database;
const restify = require('restify');
const errs = require('restify-errors');
const corsMiddleware = require('restify-cors-middleware');
const _ = require('lodash');
const geocoder = require('geocoder');
const {USER, PASSWORD, GOOGLE_MAPS_KEY} = require('./config/auth');
const {tryCatch, iterableArray, getGeoAddress} = require('./utils');

// region Arango Connection
const db = new Database('http://45.77.106.244:8529');
db.useBasicAuth(USER, PASSWORD);

db.useDatabase('mydb');

const LOCATIONS = db.collection("locations");
// endregion

// region Restify
// Setup
let server = restify.createServer();
server.use(restify.plugins.bodyParser({
  requestBodyOnGet: true
}));

const cors = corsMiddleware({
  preflightMaxAge: 5,
  origins: ['*']
});
server.pre(cors.preflight);
server.use(cors.actual);

server.get('/', async (req, res, next) => {
  res.send({
    message: "Welcome to the Location of Product API!",
    routes: [
      "/data",
      "/data/:key"
    ]
  });
  next();
});

// Routes
server.get('/data', async (req, res, next) => {
  const result = await new Promise(resolve =>
    LOCATIONS.all().then(
      cursor => cursor.map(doc => doc)
    ).then(
      keys => resolve(keys),
      err => resolve(err)
    )
  );

  if(_.isEmpty(result) || _.isError(result)) {
    console.log(result);
    res.send(400, "could not retrieve data");
  } else {
    res.contentType = 'json';
    res.send(result);
  }
  next();
});

server.get('/data/:key', async (req, res, next) => {
  const {key} = req.params;

  if(_.isEmpty(key)) {
    res.send(400, "no key provided");
  }

  const cursor = await db.query(`FOR a IN locations FILTER a._key == @key LIMIT 1 RETURN a`, {key});
  const data = await cursor.all();

  if(_.isEmpty(data) || !_.isArray(data)) {
    res.send(400, `could not find document with key: ${key}`);
  } else {
    res.contentType = 'json';
    res.send(data[0]);
  }
  next();
});

async function postLocation(req, res, next) {
  function fail(message) {
    const err = new errs.BadRequestError(`failed to post - ${message === undefined ? '' : message}`);
    return next(err);
  }

  const {key} = req.params;
  let object = req.body;

  // check if object has required properties
  let failed = false;
  ["description", "longitude", "latitude", "elevation"].every(prop => {
    try {
      if (!object.hasOwnProperty(prop)) {
        failed = true;
      }
    } catch(e) {console.log(prop, e); failed = true;}
    return !failed;
  });

  if(failed) {
    return fail("does not have all required props (description, longitude, latitude, elevation)");
  }

  if(_.isEmpty(object.datetime)) {
    object.datetime = Date.now().toString();
  }

  const {longitude, latitude, elevation, datetime} = object;
  object = _.omit(object, ["longitude", "latitude", "elevation", "datetime"]);
  object.locations = [{
    longitude, latitude, elevation, datetime,
    address: await getGeoAddress(latitude, longitude, GOOGLE_MAPS_KEY)
  }];

  if(!_.isEmpty(key)) {
    object._key = key;
  }

  const result = await new Promise(resolve =>
    LOCATIONS.save(object).then(
      meta => resolve(meta),
      err => resolve(err)
    ).catch(error => {
      resolve(error);
    })
  );

  if(_.isError(result)) {
    try{
      const {body} = result.response;
      const {code} = body;
      res.send(code, body);
      next();
    } catch(e) {
      return fail();
    }
  } else {
    res.contentType = 'json';
    res.send(result);
    next();
  }
}

server.post('/data', postLocation);
server.post('/data/:key', postLocation);

server.patch('/data/:key', async (req, res, next) => {
  function fail() {
    const err = new errs.BadRequestError("failed to put");
    return next(err);
  }

  const {key} = req.params;
  let newObject = {
    ...req.body,
    _key: key
  };

  if(_.isEmpty(newObject.datetime)) {
    newObject.datetime = Date.now().toString();
  }

  if(!_.isEmpty(newObject.locations)) {
    newObject.locations = _.sortBy(newObject.locations, 'datetime');
    for(let i = 0; i < newObject.locations.length; i++) {
      const {latitude, longitude} = newObject.locations[i];
      newObject.locations[i].address = await getGeoAddress(latitude, longitude, GOOGLE_MAPS_KEY);
    }
  }

  const result = await new Promise(resolve =>
    LOCATIONS.update(key, newObject).then(
      meta => resolve(meta),
      err => resolve(err)
    ).catch(error => {
      resolve(error);
    })
  );

  if(_.isError(result)) {
    return fail();
  }

  res.contentType = 'json';
  res.send(result);
  next();
});

server.del('/data/:key', async (req, res, next) => {
  function fail() {
    const err = new errs.BadRequestError("failed to delete");
    return next(err);
  }

  const {key} = req.params;
  if(_.isEmpty(key)) {
    return fail();
  }

  const result = await new Promise(resolve =>
    LOCATIONS.remove(key).then(
      () => resolve({message: 'Document removed'}),
      err => resolve(err)
    )
  );

  if(_.isError(result)) {
    return fail();
  }

  res.contentType = 'json';
  res.send(result);
  next();

});

server.listen(7131, () => {
  console.log('%s listening at %s', server.name, server.url);
});
// endregion
