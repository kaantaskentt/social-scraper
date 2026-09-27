import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBalance,higgsfieldBalance} from '../lib/higgsfield-balance.mjs';
test('the balance is read from the CLI line, and a signed-out CLI fails loudly',async()=>{
 assert.equal(parseBalance('taskentbusiness@gmail.com — ultra plan, 44.77 credits'),44.77);assert.equal(parseBalance('pro plan, 1,204.5 credits'),1204.5);
 assert.throws(()=>parseBalance('Session expired'),/signed in/);
 assert.deepEqual(await higgsfieldBalance({run:async()=>'plan, 12 credits'}),{credits:12});
});
