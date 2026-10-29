import { parseCatalog,entrySchema } from './schema.mjs';
import { sha256 } from './hash.mjs';
export function publicationRecords(catalog,releases=[]) {
  return [...catalog.entries.map(value=>({type:'entry',value})),...releases.map(value=>({type:'release',value})),...catalog.issues.map(value=>({type:'issue',value}))];
}
export function publicationManifest(input,releases=[],allowEmpty=false) {
  const catalog=parseCatalog(input);releases=releases.map(e=>entrySchema.parse(e));
  const records=publicationRecords(catalog,releases);let chain='0'.repeat(64);
  for(const record of records){if(Buffer.byteLength(JSON.stringify(record))>32768)throw new Error('Individual metadata record exceeds the CF 32 KiB ingress limit');chain=sha256(`${chain}\n${JSON.stringify(record)}`);}
  const {entries,issues,...meta}=catalog;return {manifest:{...meta,releases:releases.length,chain,allowEmpty},records};
}
export async function publishStaged(client,path,catalog,releases=[],allowEmpty=false) {
  const {manifest,records}=publicationManifest(catalog,releases,allowEmpty);
  const started=await client.json(path,{data:manifest});
  if(started.published)return started;
  for(let seq=started.next;seq<records.length;seq++)await client.json(`${path}/${started.snapshotId}/records/${seq}`,{data:records[seq]});
  return client.json(`${path}/${started.snapshotId}/finish`,{data:{}});
}
