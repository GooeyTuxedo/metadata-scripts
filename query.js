import { createReadStream } from 'fs';
import { parse } from '@fast-csv/parse';

// helper function to log when my own tokens are low on health
// const { personalWarning } = './secrets.js';

const fileName = process.argv.slice(2)[0];

const gen2OneOfOneIDs = [
  '2002', '2006', '2013', '2017', '2018',
  '2020', '2022', '2027', '2030', '2031',
  '2039', '2042', '2052', '2057', '2064',
  '2078', '2093', '2097', '2105', '2121',
  '2124', '2126', '2131', '2146', '2155',
  '2165', '2167', '2168', '2184', '2187',
  '2193', '2194', '2195', '2196', '2199',
  '2202', '2212', '2234', '2248', '2264',
  '2284', '2313', '2314', '2322', '2356',
  '2360', '2385', '2394', '2417', '2424',
  '2522', '2530', '2554', '2640', '2755'
];

// Read snapshot into memory
const readCSV = async (filePath) => {
  return new Promise((resolve, reject) => {
    let data = []
    return createReadStream(filePath)
      .pipe(parse({ headers: true }))
      .on('data', row => data.push(row))
      .on('end', () => resolve(data));
  });
}


// Categorizations
const splitToGenerations = tokens =>
  tokens.reduce((accumulator, token) => {
    const key = `Gen ${token.generation}`;
    const genList = accumulator[key];
    return {
      ...accumulator,
      [key]: genList ? genList.concat([token]) : [token]
    }
  }, {})

const splitToBodyTypes = tokens =>
  tokens.reduce((accumulator, token) => {
    const { body } = token;
    const bodyList = accumulator[body];
    return {
      ...accumulator,
      [body]: bodyList ? bodyList.concat([token]) : [token]
    }
  }, {})

const splitToChildren = tokens => 
  tokens.reduce((accumulator, token) => {
    const { parentID } = token;
    const children = accumulator[parentID] || [];
    return parentID ? {
      ...accumulator,
      [parentID]: children ? children.concat([token]) : [token]
    } : accumulator;
  }, {})


// List queries with logging
const findUnburiedDead = tokens => {
  const checkUnDead = token => (token.health == "0" && token.isBuried == 'false') ? true : false;
  const checkAlmostDead = token => (parseInt(token.health) > 0 && parseInt(token.health) < 7) ? true : false;
  const checkAlmostMaybeDead = token => (parseInt(token.health) > 6 && parseInt(token.health) < 11) ? true : false;

  const announceAlmostMaybeDead = deadList => console.log("Found tokens that MIGHT die tomorrow unless fed\n", deadList);
  const announceAlmostDead = deadList => console.log("Found tokens that WILL die tomorrow unless fed\n", deadList);
  const announceDead = deadList => console.log(`xxxXXX Found ${deadList.length} unburied dead XXXxxx\n`, deadList);

  const announce1of1s = list =>
    list.forEach(({tokenId, body}) => {
      if (gen2OneOfOneIDs.includes(tokenId)) {
        console.log(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!LOW HEALTH 1 of 1 #${tokenId}: ${body}`);
      }
    });

  const unburiedDead = tokens.filter(checkUnDead) // hide a token from bury list   .filter(x => x != '2124');
    .sort((a, b) => parseInt(a.generation) - parseInt(b.generation))
  const almostDead = tokens.filter(checkAlmostDead);
  const almostMaybeDead = tokens.filter(checkAlmostMaybeDead);

  const atRiskTokens = [].concat(almostMaybeDead, almostDead, unburiedDead);

  (almostMaybeDead.length > 0) ? announceAlmostMaybeDead(almostMaybeDead.map(({tokenId}) => tokenId)) : console.log("No almost maybe dead found.");
  (almostDead.length > 0) ? announceAlmostDead(almostDead.map(({tokenId}) => tokenId)) : console.log("No almost dead found.");
  (unburiedDead.length > 0) ? announceDead(unburiedDead.map(({tokenId}) => tokenId)) : console.log("No unburied dead found.");
  // personalWarning(atRiskTokens.map(({tokenId}) => tokenId));
  return announce1of1s(atRiskTokens);
}

const findPopulationDistribution = tokens => {
  const generations = splitToGenerations(tokens);
  
  for (const [gen, list] of Object.entries(generations)) {
    const livingCount = list.filter(token => token.age != 'deceased').length;
    const deadCount = list.filter(token => token.age == 'deceased').length;
    const percent =  livingCount ? Math.round(livingCount / list.length * 100) : 0
    if (gen == 'Gen 1' || gen == 'Gen 2' || gen == 'Gen 3') {
    console.log(`${gen}: ${livingCount} left alive, ${deadCount} dead out of ${list.length} tokens: ${percent}%`);
    }
  }
}

const findBodyTypesByGeneration = tokens => {
  const query = "Gen 2";
  const generations = splitToGenerations(tokens);
  const genBodyTypes = Object.entries(generations)
    .map(([gen, members]) => [gen, Object.keys(splitToBodyTypes(members))])
    .filter(([gen]) => gen == query)
    .map(([_, bodies]) => bodies)

  return console.dir(genBodyTypes, {maxArrayLength: null});
}

const findDefactoOneOfOnes = tokens => {
  const bodyTypes = splitToBodyTypes(tokens);
  const children = splitToChildren(tokens);

  const hasLivingChildren = tokenId => 
    (children[tokenId]) ? 
      children[tokenId].reduce((didFindDescendant, child) =>
        (didFindDescendant || child.age != 'deceased' || hasLivingChildren(child.tokenId)), false) :
      false;

  const uniqueBodyTypes = Object.entries(bodyTypes)
    .filter(([body, tokens]) => tokens.length > 1)
    .map(([body, tokens]) => ([body, tokens.reduce((acc, token) => {
      const isAlive = token.age != 'deceased';
      const deadButHasLivingOffspring = !isAlive && hasLivingChildren(token.tokenId)
      
        return (isAlive || deadButHasLivingOffspring) ? acc.concat([token]) : acc;
      }, []).length]))
    .filter(([body, bodyCount]) => bodyCount == 1)
    .map(([body]) => body);

  return console.log(`Searching for non-1/1 body types with only 1 instance: \n${uniqueBodyTypes.length} found\n`, uniqueBodyTypes);
}

const findOneOfOnes = tokens => {
  const bodyTypes = splitToBodyTypes(tokens);

  const uniqueBodyTypes = Object.entries(bodyTypes)
    .filter(([body, bodies]) => bodies.length == 1)
    // uncomment to find gen3 1/1s only
    // .filter(([body, [{ tokenId }]]) => !gen2OneOfOneIDs.includes(tokenId))
    .map(([body, [{ tokenId }]]) => `${tokenId}: ${body}`);

  return console.log(`Searching for 1/1 body types: \n${uniqueBodyTypes.length} found\n`, uniqueBodyTypes);
}

const findMostFertile = tokens => {
  console.log(`LEADERBOARDS FOR OVERALL GOOEY FERTILITY \n`);

  const children = splitToChildren(tokens)

  const listByChildren = tokens
    .map(token => ({ 
      ...token,
      offspring: children[token.tokenId] ? children[token.tokenId] : []
    }))
    .filter(({offspring}) => offspring.length)
    .sort((a, b) => b.offspring.length - a.offspring.length)
    .slice(0, 24)
  
  const listByCredits = tokens
    .filter(({mitosisCredits, age}) => mitosisCredits != '0')
    .sort((a, b) => parseInt(b.mitosisCredits) - parseInt(a.mitosisCredits))
    .slice(0, 24)

  console.log("TOP 25 GOOEYS BY OFFSPRING");
  listByChildren.forEach(({tokenId, body, offspring}) => console.log(
    `${offspring.length} offspring: #${tokenId} ${body}`
  ));

  console.log("\nTOP 25 GOOEYS BY MITOSIS CREDITS");
  return listByCredits.forEach(({tokenId, body, mitosisCredits}) => console.log(`${mitosisCredits} mitosis credits: #${tokenId} ${body}`));
}

const findMostFertileByGeneration = tokens => {
  const activeGen = 'Gen 2';

  const activeSet = splitToGenerations(tokens)[activeGen]
  console.log(`LEADERBOARDS FOR ${activeGen} \n`);

  const children = splitToChildren(tokens)

  const listByChildren = activeSet
    .map(token => ({ 
      ...token,
      offspring: children[token.tokenId] ? children[token.tokenId] : []
    }))
    .filter(({offspring}) => offspring.length)
    .sort((a, b) => b.offspring.length - a.offspring.length)
    .map(({tokenId, offspring}) => [tokenId, offspring.length])
    .slice(0, 9)
  
  const listByCredits = activeSet
    .filter(({mitosisCredits}) => mitosisCredits != '0')
    .sort((a, b) => parseInt(b.mitosisCredits) - parseInt(a.mitosisCredits))
    .slice(0, 9)

  console.log("TOP 10 GOOEYS BY OFFSPRING");
  listByChildren.forEach(([id, childCount]) => console.log(`#${id} has ${childCount} child${childCount > 1 ? "ren" : ""}`));

  console.log("\nTOP 10 GOOEYS BY MITOSIS CREDITS");
  return listByCredits.forEach(({tokenId, mitosisCredits}) => console.log(`#${tokenId} has ${mitosisCredits} mitosis credits`));
}

const findExtinctBodyTypes = tokens => {
  const bodyTypes = splitToBodyTypes(tokens);
  const children = splitToChildren(tokens);

  const hasLivingChildren = tokenId => 
    (children[tokenId]) ? 
      children[tokenId].reduce((didFindDescendant, child) =>
        (didFindDescendant || child.age != 'deceased' || hasLivingChildren(child.tokenId)), false) :
      false;

  const extinctBodyTypes = Object.entries(bodyTypes)
    .map(([body, tokens]) => ([
      body,
      tokens.reduce((acc, token) => {
        const isAlive = token.age != 'deceased';
        const deadButHasLivingOffspring = !isAlive && hasLivingChildren(token.tokenId)
        
        return (isAlive || deadButHasLivingOffspring) ? acc.concat([token]) : acc;
      }, [])
    ]))
    .filter(([body, buried]) => buried.length == 0)

  console.log(`Castaway #2193 has living kids?   =>  ${hasLivingChildren('2193')}`)
  return console.log(`Searching for extinct lineages: \n${extinctBodyTypes.length} found\n`, extinctBodyTypes.map(([x]) => x));
}

const findMostMitosisCredits = tokens => console.log(tokens
  .map(({ tokenId, mitosisCredits }) => [tokenId, mitosisCredits])
  .sort((tokenA, tokenB) => parseInt(tokenB[1]) - parseInt(tokenA[1]))
  .slice(0, 24)
  .map(([id, mc]) => `#${id}: ${mc} credits`));



// Execution: Choose your query captain
(async () => {
  try {
    const tokens = await readCSV(fileName);
    
    findPopulationDistribution(tokens);
    findUnburiedDead(tokens);
    // findMostMitosisCredits(tokens)
    // findBodyTypesByGeneration(tokens)
    // findExtinctBodyTypes(tokens);
    // findDefactoOneOfOnes(tokens);
    // findOneOfOnes(tokens);
    // findMostFertile(tokens);
    // findMostFertileByGeneration(tokens);
  } catch (err) {
    console.error(err);
  }
})();