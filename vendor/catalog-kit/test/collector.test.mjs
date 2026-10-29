import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCatalog } from '../src/collector.mjs';
import { memoryCheckpoint } from '../src/round.mjs';
const config={topics:['covel-plugin','covel-plugins'],officialRepositories:[],seedRepositories:[],excludeRepositories:{},maxPluginsPerRepository:100};
test('shared collector revalidates all resumed membership and only acknowledges successful publication',async()=>{
  const checkpoint=memoryCheckpoint(),releaseCheckpoint=memoryCheckpoint();let publicNow=true,publications=0;
  const repo={id:42,full_name:'author/demo',private:false,disabled:false,archived:false,default_branch:'main',owner:{id:7,login:'author'},topics:['covel-plugin'],stargazers_count:0};
  const get=async endpoint=>{
    if(endpoint.startsWith('/search/'))return {incomplete_results:false,total_count:1,items:[repo]};
    if(endpoint==='/repos/author/demo')return repo;
    if(endpoint==='/repositories/42')return {...repo,private:!publicNow};
    if(endpoint.includes('/commits/'))return {sha:'a'.repeat(40),commit:{tree:{sha:'b'.repeat(40)}}};
    if(endpoint.includes('/git/trees/'))return {truncated:false,tree:[]};
    throw new Error(endpoint);
  };
  await assert.rejects(collectCatalog({kind:'plugins',config,get,checkpoint,releaseCheckpoint,onComplete:async()=>{publications++;throw new Error('ingestion offline');}}));
  assert.equal((await checkpoint.load()).acknowledged,false);
  publicNow=false;
  const result=await collectCatalog({kind:'plugins',config,get,checkpoint,releaseCheckpoint,onComplete:async catalog=>{publications++;assert.equal(catalog.entries.length,0);}});
  assert.equal(result.entries.length,0);assert.equal(publications,2);assert.equal((await checkpoint.load()).acknowledged,true);
});
