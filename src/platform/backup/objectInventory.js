export async function collectObjectInventory({ provider, resolveObjectId, maximumPages = 10_000 }) {
  const items = [];
  let continuationToken = null;
  for (let page = 0; page < maximumPages; page += 1) {
    const result = await provider.listInventory({ continuationToken });
    for (const item of result.objects) items.push(Object.freeze({ objectId: resolveObjectId(item.key), byteLength: item.byteLength, etag: item.etag, lastModified: item.lastModified }));
    continuationToken = result.continuationToken;
    if (!continuationToken) return Object.freeze(items);
  }
  throw new Error("Object inventory exceeded the bounded page limit.");
}
