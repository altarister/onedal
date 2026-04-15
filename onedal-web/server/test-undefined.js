const subCalls = [
    { dropoffX: 1, dropoffY: 2 }
];

const mainCallState = { dropoffX: 3, dropoffY: 4 };
const securedOrder = { dropoffX: undefined, dropoffY: 5 };

const allDropoffs = [
    { x: mainCallState.dropoffX, y: mainCallState.dropoffY },
    ...subCalls.map(c => ({ x: c.dropoffX, y: c.dropoffY })),
    { x: securedOrder.dropoffX, y: securedOrder.dropoffY }
];

console.log("allDropoffs:", allDropoffs);

const sortedDropoffs = [...allDropoffs];
const mergedDest = sortedDropoffs.pop();
console.log("mergedDest:", mergedDest);
