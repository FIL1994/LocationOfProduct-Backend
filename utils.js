/**
 * @author Philip Van Raalte
 * @date 2018-01-18
 */
const _ = require('lodash');
const fetch = require('node-fetch');

/**
 * A function that runs a function in a try catch and returns a defaultValue if an error is thrown.
 * @param functionToTry
 * @param defaultValue
 * @param log
 * @returns {*}
 */
const tryCatch = (functionToTry, defaultValue = undefined, log = false) =>  {
  try {
    return functionToTry();
  } catch (e) {
    if(log) {
      console.log("ERROR", e);
    }
    return defaultValue
  }
};

const iterableArray = (size) => {
  return [...Array(size)];
};

async function getGeoAddress(latitude, longitude, GOOGLE_MAPS_KEY) {
  console.log("Getting");
  const geoJSON = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_KEY}`
  );
  if(geoJSON.status !== 200) {
    return "N/A";
  }
  const data = await geoJSON.json();

  return tryCatch(
    () => data.results[0].formatted_address,
    "N/A"
  );
}

module.exports = {
  tryCatch,
  iterableArray,
  getGeoAddress
};