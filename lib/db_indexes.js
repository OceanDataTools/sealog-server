// A full single-field index supports timestamp ranges and sorting in either
// direction. Reuse manually created indexes regardless of their name.
exports.ensureEventTimestampIndex = async (collection) => {

  const indexes = await collection.listIndexes().toArray();
  const timestampIndex = indexes.find((index) => {

    return Object.keys(index.key).length === 1 &&
      [1, -1].includes(index.key.ts) &&
      !index.sparse && !index.partialFilterExpression && !index.hidden;
  });

  if (timestampIndex) {
    return;
  }

  console.log('Creating events timestamp index');
  await collection.createIndex({ ts: -1 });
};
