import fs from 'fs';
import csv from 'fast-csv';
import fetch from 'node-fetch';

const endTokenId = parseInt(process.argv.slice(2)[0]);
const baseUrl = "https://ethgobblers.com/metadata/"

const extractMetadata = json => {
  if (!json) return {};
  if (!json.attributes) return {};

  const attrs = json.attributes;
  const reducer = (acc, { trait_type, value }) => { return { ...acc, [trait_type]: value }};
  const attrsObj = attrs.reduce(reducer, {});

  const {
    age,
    body = "NOT_REVEALED",
    disposition,
    health,
    isAwake,
    isBuried,
    generation,
    mitosisCredits,
    parentID
  } = attrsObj;

  return {
    tokenId: parseInt(json.name.match(/#(\d+)/)[1]),
    image: json.image,
    age,
    body,
    disposition,
    health,
    isAwake,
    isBuried,
    generation,
    mitosisCredits,
    parentID
  };
}

const getMetadata = async (tokenId) => {
  const url = `${baseUrl}${tokenId}`;
  const response = await fetch(url)
    .then(res => res.json())
    .catch(err => console.log(`Error fetching #${tokenId}`));

  return response;
}

const getMetadataList = async (n) => {
  const range = Array.from({ length: n + 1 }, (_, i) => i);
  const metadataPromises = range.map(getMetadata);

  return Promise.all(metadataPromises);
}

const getMetadataByIDList = async (idList) => {
  console.log(`fetching missing values: \n`, idList);
  const metadataPromises = idList.map(getMetadata);
  return Promise.all(metadataPromises);
}

const getMissingMetadata = async (tokens) => {
  const range = Array.from({ length: endTokenId + 1 }, (_, i) => i);
  const extractedTokens = tokens.map(extractMetadata);
  const tokenIDs = extractedTokens.map(token => token["tokenId"]);
  const missingIds = range.reduce((acc, id) => tokenIDs.includes(id) ? acc : acc.concat([id]), []);
  const replacementValues = await getMetadataByIDList(missingIds);

  return [tokens, replacementValues];
}

const zipMetadataList = ([metadataList, replacementValues]) => { 
  const repVs = replacementValues.filter(x => x != {})
  console.log("values fetched: \n", repVs.map(extractMetadata).filter(x => x).map(x => x['tokenId']));
  return metadataList
    .concat(repVs);
}

function formatMetadataListToCSV(metadataList) {
  let snapshotDir = 'SNAPS/';
  let headers = ["tokenId", "image", "age", "body", "disposition", "health", "isAwake", "isBuried", "generation", "mitosisCredits", "parentID"];
  let date = new Date();
  let timestamp = date.toISOString().slice(0, 10);
  let fileName = `${timestamp}-metadata-upto-${endTokenId}.csv`;
  let csvStream = csv.format({ headers: headers });
  let writableStream = fs.createWriteStream(`${snapshotDir}${fileName}`);
  csvStream.pipe(writableStream);

  metadataList.forEach(metadata => {
    let data = [metadata.tokenId, metadata.image, metadata.age, metadata.body, metadata.disposition, metadata.health, metadata.isAwake, metadata.isBuried, metadata.generation, metadata.mitosisCredits, metadata.parentID];
    if (!isNaN(metadata.tokenId)) {
      csvStream.write(data);
    }
  });

  csvStream.end();
  console.log(`${fileName} file has been created`);
}

getMetadataList(endTokenId) // <3
  .then(getMissingMetadata)
  .then(zipMetadataList)
  .then(list => list.map(extractMetadata))
  .then((finalList) => {
    console.log('success ', finalList[0]);
    return finalList.sort((a, b) => a.tokenId - b.tokenId);
  })
  .then(finalList => formatMetadataListToCSV(finalList))
  .catch(error => console.log('program failed with error: ', error));
